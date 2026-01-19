'use strict'
/*
..######..########.########..####....###....##.......####.########....###....########.####..#######..##....##
.##....##.##.......##.....##..##....##.##...##........##.......##....##.##......##.....##..##.....##.###...##
.##.......##.......##.....##..##...##...##..##........##......##....##...##.....##.....##..##.....##.####..##
..######..######...########...##..##.....##.##........##.....##....##.....##....##.....##..##.....##.##.##.##
.......##.##.......##...##....##..#########.##........##....##.....#########....##.....##..##.....##.##..####
.##....##.##.......##....##...##..##.....##.##........##...##......##.....##....##.....##..##.....##.##...###
..######..########.##.....##.####.##.....##.########.####.########.##.....##....##....####..#######..##....##
*/

import assert from 'assert'
import { lub } from './Level.mjs';
import * as Ty from './TroupeTypes.mjs'
import { LVal } from './Lval.mjs';
import { Level } from './Level.mjs';
import { StopThreadError, ThreadError, ErrorKind } from './TroupeError.mjs';
import { getRuntimeObject } from './SysState.mjs';

import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
const argv = getCliArgs();

let logLevel = argv[TroupeCliArg.Debug] ? 'debug': 'info'
import { mkLogger } from './logger.mjs'
const logger = mkLogger('SRL', logLevel);
const debug = x => logger.debug(x)


export class UnserializableObjectError extends StopThreadError {
    obj: LVal
    explainstr: string = null;
    errorKind: ErrorKind = ErrorKind.DynTypeError;
    get errorMessage ()  {
        return (`Unserializable object: ${this.obj.stringRep()}`);
        // TODO: 2021-06-12: improve error reporting
        // - indicate what the current type of this object is
        // - and explain why it is the case that it isn't serializable
    }

    constructor (obj:LVal) {
        super (getRuntimeObject().$t) ;
        this.obj = obj
    }
}

/**
 * Error thrown when attempting to serialize quarantined data to a node
 * other than the original quarantine source node.
 *
 * Quarantined data can only be sent back to its source node (where labels
 * are restored to their original form) or processed locally. Forwarding
 * quarantined data to third parties is prohibited.
 */
export class QuarantinedDataForwardingError extends StopThreadError {
    lval: LVal;
    targetNodeId: string;
    explainstr: string = "Quarantined data contains labels tagged with their source node. " +
                         "This data can only be sent back to its original source (where labels are restored) " +
                         "or processed locally. Forwarding to third parties is prohibited to prevent " +
                         "unauthorized information flow.";
    errorKind: ErrorKind = ErrorKind.IFCCheck;

    get errorMessage() {
        return `Cannot forward quarantined data to node "${this.targetNodeId}". ` +
               `Quarantined labels can only be sent back to their source node.`;
    }

    constructor(lval: LVal, targetNodeId: string) {
        super(getRuntimeObject().$t);
        this.lval = lval;
        this.targetNodeId = targetNodeId;
    }
}


/**
 * Serializes a labeled value for transmission to another node.
 *
 * @param w The labeled value to serialize
 * @param pclev The PC level at the time of serialization
 * @param targetNodeId Optional target node ID. If provided and the value contains
 *        quarantined labels, those labels will be restored if the target matches
 *        the quarantine source, or an error will be thrown if they don't match.
 * @returns Serialized data and the computed level
 * @throws QuarantinedDataForwardingError if quarantined data targets wrong node
 */
export function serialize(w:LVal, pclev:Level, targetNodeId?: string) {
    let seenNamespaces = new Map();
    let seenClosures = new Map();
    let seenEnvs = new Map();

    let namespaces = [];
    let closures = [];
    let envs = [];


    let level = pclev;

    /**
     * Helper to serialize a level, handling quarantine restoration.
     * @param lev The level to serialize
     * @param contextLval The LVal containing this level (for error reporting)
     * @returns JSON representation of the level (restored if needed)
     */
    function serializeLevel(lev: Level, contextLval: LVal): any {
        if (lev.hasQuarantinedLabels && lev.hasQuarantinedLabels()) {
            if (targetNodeId === undefined) {
                throw new QuarantinedDataForwardingError(contextLval, 'unknown');
            }
            const restored = lev.restoreForNode(targetNodeId);
            if (restored === null) {
                throw new QuarantinedDataForwardingError(contextLval, targetNodeId);
            }
            return restored.toJSON();
        }
        return lev.toJSON();
    }

    function walk(lval:LVal) {
        assert(Ty.isLVal(lval));

        level = lub(level, lval.lev); // 2018-09-24: AA: is this the only place
        // where we need to check the level of the message?

        let jsonObj;
        let x = lval.val;
        


        let _tt = lval.troupeType

        
        

        switch (_tt) {
            case Ty.TroupeType.RECORD:
                jsonObj = [];
                for (let [k,v] of x.__obj.entries()) {
                    jsonObj.push ([k, walk(v)])
                }
                break;
            case Ty.TroupeType.LIST:
                jsonObj = [];
                let y = x.toArray()
                
                for (let i = 0; i < y.length; i++) {
                    jsonObj.push(walk(y[i]));
                }
                break;
            case Ty.TroupeType.TUPLE:
                jsonObj = [];                                                
                for (let i = 0; i < x.length; i++) {
                    jsonObj.push(walk(x[i]));
                }
                break;
            case Ty.TroupeType.CLOSURE:
                if (!Ty.isSerializableClosure (lval.closureType)) {
                    throw new UnserializableObjectError (lval)
                }

                if (seenClosures.has(x)) { // debuglog ("pointer to [existing] heap object", seen.get(x))
                    jsonObj = { ClosureID: seenClosures.get(x) };
                } else {
                    jsonObj = { ClosureID: closures.length }
                    seenClosures.set(x, closures.length);
                    let jsonClosure: any = {};
                    closures.push(jsonClosure);

                    let jsonEnvPtr;
                    if (seenEnvs.has(x.env)) {
                        jsonEnvPtr = { EnvID: seenEnvs.get(x.env) }
                    } else {
                        jsonEnvPtr = { EnvID: envs.length };
                        seenEnvs.set(x.eqnv, envs.length)
                        let jsonEnv = {};
                        envs.push(jsonEnv);

                        for (let field in x.env) {
                            if (field != "ret" && field != "_is_rt_env" && field != "__dataLevel") {
                                let y = x.env[field];
                                jsonEnv[field] = walk(y);
                            }
                        }
                    }

                    jsonClosure.envptr = jsonEnvPtr;
                    // debug (`the namespace is ${x.namespace}`);
                    for (let ff in x.namespace) {
                        // debug (`the function in the namespace is ${ff.toString()}`)
                        if (x.namespace[ff] == x.fun) {
                            let jsonNamespacePtr;
                            let namespace;
                            if (seenNamespaces.has(x.namespace)) {
                                let n_id = seenNamespaces.get(x.namespace);
                                jsonNamespacePtr = { NamespaceID: n_id };
                                namespace = namespaces[n_id];
                            } else {
                                jsonNamespacePtr = { NamespaceID: namespaces.length };
                                seenNamespaces.set(x.namespace, namespaces.length);
                                namespace = new Map();
                                namespaces.push(namespace);
                            }

                            namespace.set(ff, x.fun.serialized)

                            function dfs(deps) {
                                for (let depName of deps) {
                                    if (!namespace.has(depName)) {
                                        namespace.set(depName, x.namespace[depName].serialized);
                                        dfs(x.namespace[depName].deps);
                                    }
                                }
                            }

                            dfs(x.fun.deps);

                            jsonClosure.namespacePtr = jsonNamespacePtr;
                            jsonClosure.fun = ff;
                        }
                    }
                }
                break;
            case Ty.TroupeType.LEVEL:
                // Handle quarantined labels during serialization
                jsonObj = { lev: serializeLevel(x, lval), isLevel: true };
                break;
            case Ty.TroupeType.LVAL:
                jsonObj = walk(x);
                break;
            case Ty.TroupeType.AUTHORITY:
                // Authority level can also contain quarantined labels
                jsonObj = { authorityLevel: serializeLevel(x.authorityLevel, lval) }
                break;
            case Ty.TroupeType.ATOM:
                jsonObj = { atom: x.atom, creation_uuid: x.creation_uuid };
                break;
            case Ty.TroupeType.LOCALOBJECT: 
                throw new UnserializableObjectError (lval)
            default:
                jsonObj = x;
        }

        // OBS: we are moving away from LVal representation
        // to a more explicit tuple that is different on purpose
        // from LVal. 2018-09-20: AA; We should ideally encapsulate
        // that in a different class with a name that reflects that 
        // this is a transport-level representation. 

        return {
            val: jsonObj
            , lev: serializeLevel(lval.lev, lval)
            , tlev: serializeLevel(lval.tlev, lval)
            , troupeType: _tt
        };
    }

    let value = walk(w);
    // The final level is the lub of the value's level and the PC level
    // This also needs quarantine handling
    const finalLevel = lub(w.lev, pclev);
    value.lev = serializeLevel(finalLevel, w);


    let nsp = [];
    for (let j = 0; j < namespaces.length; j++) {
        nsp.push(Array.from(namespaces[j]));
    }

    let serializeObj = {
        libdeps: []
        , namespaces: nsp
        , closures: closures
        , envs: envs
        , value: value
    };

    // TODO: propagate the level; 
    return { data: serializeObj, level: level }
}
