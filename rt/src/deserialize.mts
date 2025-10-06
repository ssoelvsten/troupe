"use strict";
import { strict as assert } from 'node:assert'
import {spawn} from 'child_process'
import * as Ty from './TroupeTypes.mjs'
import { LVal } from './Lval.mjs';
import { mkTuple, mkList } from './ValuesUtil.mjs';
import { ProcessID } from './process.mjs';
import { Authority } from './Authority.mjs';
import { Atom } from './Atom.mjs';
import { __unitbase }from './UnitBase.mjs'
import { glb, mkLevel } from './Level.mjs';
import { RuntimeInterface } from './RuntimeInterface.mjs';
import { Level } from './Level.mjs';
import { Record } from './Record.mjs';
import { RawClosure } from './RawClosure.mjs';
import * as levels from './Level.mjs';

// OBS: The variables below are all global! This is because the callback and deserializedJson
// changes all the time while the compiler process has been started.

/** We spawn an instance of the Troupe compiler in its interactive IR mode. Through this, we
 *  pass the IR provided by other nodes.
 *
 *  Since there is only one compiler process which is accessed via the lock below, we can guarantee
 *  a FIFO ordering on the compilation input/output pairs.
 */
let __compilerOsProcess = null;

/** Simple flag to make sure we handle one deserialization at a time. */
let __isCurrentlyUsingCompiler = false;

/** The runtime object to which we should be deserializing. */
let __rtObj = null;

export function setRuntimeObj(rt: RuntimeInterface) {
  __rtObj = rt;
}

/** A callback for synchronizing with the caller. */
let __currentCallback = null;

/** The JSON with the context for deserialization. */
let __currentDeserializedJson = null;

/** The trust level of the sender, i.e. implicit declassification based on the (lack of) trust. */
let __trustLevel = null;

const MARKER = "/*-----*/";

function startCompiler() {
    __compilerOsProcess = spawn(process.env.TROUPE + '/bin/troupec', ['--json-ir']);
    __compilerOsProcess.on('exit', (code: number) => {
        process.exit(code);
    });

    let marker = MARKER + "\n\n";

    // accumulator of communication with the compiler; reset after
    // each deserialization; needed because we have no guarantees about
    // how the data coming back from the compiler is chunked
    //
    // TODO: Switch to an array of strings which are `join`ed at the end.
    //       This is ~4-10x faster.
    let accum = "";

    __compilerOsProcess.stdout.on('data', (data: string) => {
        accum += data;
        let j = accum.indexOf(marker);
        if (j >= 0) {
            constructCurrent(accum.slice(0, j));
            accum = accum.slice(j + marker.length);
        }
    });
}
startCompiler();

export function stopCompiler() {
    __compilerOsProcess.stdin.end();
}

// -------------------------------------------------------------------------------------------------

// some rudimentary debugging mechanisms; probably should be rewritten
var indentCounter = 0;

function indent() {
  indentCounter++;
}

function unindent() {
  indentCounter--;
}

function debuglog(...s) {
    let spaces = "";
    for (let j = 0; j < indentCounter; j++) {
        spaces = "  " + spaces;
    }

    s.unshift("DEBUG:" + spaces);
    console.log.apply(null, s);
}

// -------------------------------------------------------------------------------------------------

function deserializationError() {
    console.log("DESERIALIZATION ERROR HANDLING IS NOT IMPLEMENTED")
    process.exit(1);
}

// -------------------------------------------------------------------------------------------------

const HEADER : string = `
this.libSet = new Set ()
this.libs = []
this.addLib = function (lib, decl) {
  if (!this.libSet.has (lib +'.'+decl)) {
    this.libSet.add (lib +'.'+decl);
    this.libs.push ({lib:lib, decl:decl});
  }
}
`;

function constructCurrent(compilerOutput: string | null) {
    __isCurrentlyUsingCompiler = false;
    const serobj = __currentDeserializedJson;
    const desercb = __currentCallback;

    // 1. reconstruct the namespaces
    let ctxt = { // deserialization context
        namespaces : new Array (serobj.namespaces.length),
        closures   : new Array (serobj.closures.length),
        envs       : new Array (serobj.envs.length),
    }

    const snippets = compilerOutput ? compilerOutput.split("\n\n") : [];
    let k = 0;
    for (let i = 0; i < serobj.namespaces.length; i++) {
        let ns    = serobj.namespaces[i]
        let nsFun = HEADER;

        let atomSet = new Set<string>()

        for (let j = 0; j < ns.length; j++) {
            if (j > 0) {
                nsFun += "\n\n" // looks neater this way
            }
            let snippetJson = JSON.parse(snippets[k++]);
            nsFun += snippetJson.code;

            for (let atom of snippetJson.atoms) {
                atomSet.add(atom);
            }
        }
        let argNames  = Array.from(atomSet);
        let argValues = argNames.map(argName => {return new Atom(argName)})
        argNames.unshift('rt');
        argNames.push(nsFun);
        // Observe that there is some serious level of reflection going on in here.
        // The arguments to `Function` are: 'rt', ATOM1, ..., ATOMk, nsFun
        const NS: any = Reflect.construct (Function, argNames);

        // We now construct an instance of the newly constructed object
        // that takes the runtime object + atoms as its arguments
        argValues.unshift(__rtObj);
        ctxt.namespaces[i] = Reflect.construct (NS, argValues);
    }

    // 2. reconstruct the closures and environments
    const sercloss = serobj.closures;
    const serenvs  = serobj.envs;

    function mkClosure(i: number) {
        if (!ctxt.closures[i]) {
            const nm = ctxt.namespaces[sercloss[i].namespacePtr.NamespaceID]
            const fn = nm[sercloss[i].fun];
            const env = mkEnv(sercloss[i].envptr.EnvID, (env) => {
                ctxt.closures[i] = RawClosure(env, nm, fn);
            })
            ctxt.closures[i].__dataLevel = env.__dataLevel;
        }
        return ctxt.closures[i];
    }

    function mkEnv(i: number, post_init?: (any)=>void ) {
        if (!ctxt.envs[i]) {
            let env = {__dataLevel : levels.BOT};
            if (post_init) {
                post_init (env);
            }
            ctxt.envs[i] = env;
            for (var field in serenvs[i]) {
                const v = mkValue(serenvs[i][field]);
                env[field] = v;
                env.__dataLevel = levels.lub (env.__dataLevel, v.dataLevel)
            }
        } else {
            if (post_init) {
                post_init (ctxt.envs[i]);
            }
        }
        return ctxt.envs[i]
    }


    function deserializeArray(x) {
        let a = [];
        for (let i = 0; i < x.length; i++) {
            a.push(mkValue(x[i]));
        }
        return a;
    }

    function mkValue(arg: { val: any; lev: any; tlev: any; troupeType: Ty.TroupeType; }) {
        assert(Ty.isLVal(arg));
        const obj = arg.val;
        const lev = mkLevel(arg.lev);
        const tlev = mkLevel(arg.tlev);

        function _trustGLB(x: Level) {
            return glb(x, __trustLevel);
        }

        function value() {
            switch (arg.troupeType) {
                case Ty.TroupeType.RECORD:
                    // for records, the serialization format is  [[key, value_json], ...]
                    let a = [];
                    for (let i = 0; i < obj.length; i++) {
                        a.push ([ obj[i][0], mkValue(obj[i][1]) ]);
                    }
                    return Record.mkRecord(a);
                case Ty.TroupeType.LIST:
                    return mkList(deserializeArray(obj));
                case Ty.TroupeType.TUPLE:
                    return mkTuple(deserializeArray(obj));
                case Ty.TroupeType.CLOSURE:
                    return mkClosure(obj.ClosureID);
                case Ty.TroupeType.NUMBER:
                case Ty.TroupeType.BOOLEAN:
                case Ty.TroupeType.STRING:
                    return obj;
                case Ty.TroupeType.PROCESS_ID:
                    return new ProcessID(obj.uuid, obj.pid, obj.node)
                case Ty.TroupeType.AUTHORITY:
                    // Attenuate authority based on the trust level of the sender
                    return new Authority(_trustGLB(mkLevel(obj.authorityLevel)));
                case Ty.TroupeType.LEVEL:
                    return mkLevel(obj.lev);
                case Ty.TroupeType.LVAL:
                    return mkValue(obj);
                case Ty.TroupeType.ATOM:
                    return new Atom(obj.atom, obj.creation_uuid);
                case Ty.TroupeType.UNIT:
                     return __unitbase;
                default:
                     return obj;
            }
        }

        return new LVal(value(), _trustGLB(lev), _trustGLB(tlev));
    }

    for (let i = 0; i < sercloss.length; i++) {
        mkClosure(i);
    }

    for (let i = 0; i < serenvs.length; i++) {
        mkEnv(i);
    }

    let v = mkValue(serobj.value);

    // For each namespace we have generated, load all libraries before calling the last callback.
    function loadLib(i: number, cb) {
        if (i < ctxt.namespaces.length) {
            __rtObj.linkLibs(ctxt.namespaces[i]).then(() => loadLib(i + 1, cb));
        } else {
            cb();
        }
    }

    loadLib(0, () => desercb(v));
}

// TODO: Implement a proper deserialization queue instead of the coarse-grained piggybacking on the
//       event loop below.
function deserializeCb(lev: Level, jsonObj: any, cb: (body: LVal) => void) {
    if (__isCurrentlyUsingCompiler) {
        // Other thread is currently deserializing, postpone execution.
        setImmediate(deserializeCb, lev, jsonObj, cb);
    } else {
        // Prevent parallel deserialization attempts (abuses that JavaScript is a singly threaded
        // language). Be wary when messing with the variables below, they are all global!
        __isCurrentlyUsingCompiler = true;
        __trustLevel = lev;
        __currentCallback = cb;
        __currentDeserializedJson = jsonObj;

        if (jsonObj.namespaces.length > 0) {
            for (let i = 0; i < jsonObj.namespaces.length; i++) {
                let ns = jsonObj.namespaces[i];
                for (let j = 0; j < ns.length; j++) {
                    __compilerOsProcess.stdin.write(ns[j][1]);
                    __compilerOsProcess.stdin.write("\n");
                }
            }
            __compilerOsProcess.stdin.write("!ECHO " + MARKER + "\n");
        } else {
            // Unnecessary interaction with the compiler: skip it!
            constructCurrent(null);
        }
    }
}

export function deserialize(lev: Level, jsonObj: any): Promise<LVal> {
    return new Promise((resolve, reject) => {
        deserializeCb(lev, jsonObj, (body: LVal) => resolve(body));
    });
}
