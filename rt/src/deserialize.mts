"use strict";
import { strict as assert } from 'node:assert'
import { spawn, ChildProcess } from 'child_process'
import * as Ty from './TroupeTypes.mjs'
import { LVal } from './Lval.mjs';
import { mkTuple, mkList } from './ValuesUtil.mjs';
import { ProcessID } from './process.mjs';
import { Authority } from './Authority.mjs';
import { Atom } from './Atom.mjs';
import RawUnit from './RawUnit.mjs'
import { glb, mkLevel } from './Level.mjs';
import { RuntimeInterface } from './RuntimeInterface.mjs';
import { Record } from './Record.mjs';
import { RawClosure } from './RawClosure.mjs';
import { Level, lub, BOT } from './Level.mjs';

// OBS: The variables below with `__` prefixes are all global! This is because the callback and
// deserializedJson changes all the time while the compiler process has been started.

// -------------------------------------------------------------------------------------------------
// Troupe Compiler
//
// We run the compiler in *interactive* mode. Since there is only one compiler process which is
// accessed via the lock below, we can guarantee a FIFO ordering on the compilation input/output
// pairs.

/** Magic marker to identify when the compiler is done a single deserialization and compilation. */
const MARKER = "/*-----*/";

// TODO: Add types for `jsonObj` and `compilerOutput` variables.

type CompilerJob = {
    /** The to be deserialized object. */
    jsonObj: any;
    /** Trust level of the sender. The result should implicitly be declassified based on the (lack
     *  of) trust. */
    trustLevel: Level;
    /** Callback to hand the final value back to be used at runtime. */
    callback: (LVal) => void;
};

type CompilerOutput = string | undefined;

/** Forwards the compiler output (if any) for value reconstruction. */
function onJobDone({ jsonObj, trustLevel, callback }: CompilerJob,
                   compilerOutput: CompilerOutput)
  : void
{
    setImmediate(
        () => reconstruct(jsonObj, compilerOutput, trustLevel).then(v => callback(v))
    );
}

/** We spawn an instance of the Troupe compiler in its interactive IR mode. Through this, we
 *  pass the IR provided by other nodes.
 */
let __compilerOsProcess : ChildProcess | null = null;

/** Queue of to be done jobs that have been sent to the compiler. */
let __compilerQueue  : CompilerJob[] = [];

/** Push a deserialization job to the compiler. */
function pushCompilerQueue(cj : CompilerJob): void
{
    // Skip the compiler, if it is a simple value and not a function.
    if (cj.jsonObj.namespaces.length === 0) {
        return onJobDone(cj, undefined);
    }

    // Push each namespace object to the compiler
    __compilerQueue.push(cj);

    for (let i = 0; i < cj.jsonObj.namespaces.length; ++i) {
        let ns = cj.jsonObj.namespaces[i];
        for (let j = 0; j < ns.length; ++j) {
            __compilerOsProcess.stdin.write(ns[j][1]);
            __compilerOsProcess.stdin.write("\n");
        }
    }
    __compilerOsProcess.stdin.write("!ECHO " + MARKER + "\n");
};

function startCompiler(): void
{
    __compilerOsProcess = spawn(process.env.TROUPE + '/bin/troupec', ['--json-ir']);
    __compilerOsProcess.on('exit', (code: number) => {
        process.exit(code);
    });

    let marker = MARKER + "\n\n";

    // accumulator of communication with the compiler; reset after each
    // deserialization; needed because we have no guarantees about how the data
    // coming back from the compiler is chunked
    //
    // TODO: Only check the new data for the marker to not recheck the same
    //       substring again and again? But, what about the marker being split
    //       between two instances of `data`?
    //
    // TODO: Switch to an array of strings which are `join`ed at the end. This
    //       is ~4-10x faster.
    let accum = "";

    __compilerOsProcess.stdout.on('data', (data: string) => {
        accum += data;
        let markerIdx = accum.indexOf(marker);
        if (markerIdx >= 0) {
            const cj : CompilerJob = __compilerQueue.shift();
            onJobDone(cj, accum.slice(0, markerIdx));
            accum = accum.slice(markerIdx + marker.length);
        }
    });
}
startCompiler();

export function stopCompiler() {
    __compilerOsProcess.stdin.end();
}

// -------------------------------------------------------------------------------------------------
// Runtime Object

/** The runtime object to which we should be deserializing.
 *
 * @todo Fix this tight coupling.
 */
let __rtObj = null;

export function setRuntimeObj(rt: RuntimeInterface) {
    __rtObj = rt;
}

// -------------------------------------------------------------------------------------------------
// Value Reconstruction

/** Fixed JavaScript preamble for libraries. */
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

/** Reconstruct the value stored in the serialized `jsonObj` compiled into `compilerOutput` at the
 *  given `trustLevel`.
 *
 *  @todo Split this function into several smaller helper functions.
 */
async function reconstruct(jsonObj: any, compilerOutput: string | undefined, trustLevel: Level)
  : Promise<LVal>
{
    // 1. reconstruct the namespaces
    let ctxt = { // deserialization context
        namespaces : new Array (jsonObj.namespaces.length),
        closures   : new Array (jsonObj.closures.length),
        envs       : new Array (jsonObj.envs.length),
    }

    const snippets = compilerOutput ? compilerOutput.split("\n\n") : [];
    let k = 0;
    for (let i = 0; i < jsonObj.namespaces.length; i++) {
        let ns    = jsonObj.namespaces[i]
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
    const sercloss = jsonObj.closures;
    const serenvs  = jsonObj.envs;

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
            let env = { __dataLevel : BOT };
            if (post_init) {
                post_init (env);
            }
            ctxt.envs[i] = env;
            for (var field in serenvs[i]) {
                const v = mkValue(serenvs[i][field]);
                env[field] = v;
                env.__dataLevel = lub (env.__dataLevel, v.dataLevel)
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
            return glb(x, trustLevel);
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
                     return RawUnit;
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

    let v = mkValue(jsonObj.value);

    // For each namespace we have generated, load all libraries before returning the reconstructed
    // value.
    for (let i = 0; i < ctxt.namespaces.length; ++i) {
        await __rtObj.linkLibs(ctxt.namespaces[i]);
    }

    return v;
}

// -------------------------------------------------------------------------------------------------

/** Deserialize the given `jsonObj` into a Troupe value.
 *
 * @param jsonObj    Object to be deserialized.
 * @param trustTevel Trust level to the origin of `jsonObj`.
 *
 * @todo Swap the order of the arguments?
 */
export async function deserialize(trustLevel: Level, jsonObj: any): Promise<LVal> {
    return new Promise((resolve, reject) => {
        pushCompilerQueue({ jsonObj, trustLevel, callback: (v: LVal) => resolve(v) });
    });
}
