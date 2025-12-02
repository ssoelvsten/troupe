'use strict'
import { isEqual } from '../base/rawEquals.mjs'
import { isList, isTuple, mkTuple, mkList, mkWithRecord, mkRecord, isRecord } from '../base/rawUtil.mjs'
import { LVal, LValCopyAt, LCopyVal } from '../base/LVal.mjs'
import { Nil, Cons, RawList } from '../base/RawList.mjs'
import { loadLibsAsync } from '../loadLibsAsync.mjs';
import * as levels from '../Level.mjs'
import { BuiltinFunction, ServiceFunction } from '../base/LocalFunction.mjs'
import { RawAtom } from '../base/RawAtom.mjs'
import { unitLVal } from '../base/unitLVal.mjs'
import { RuntimeInterface } from '../RuntimeInterface.mjs';
import { RawRecord } from '../base/RawRecord.mjs'
import { TroupeType } from '../base/TroupeTypes.mjs'
import { RawClosure } from '../base/RawClosure.mjs'
import RawUnit from '../base/RawUnit.mjs'
import { Thread } from '../Thread.mjs'
import { RawValue } from '../base/RawValue.mjs'
import { RawTuple } from '../base/RawTuple.mjs'
import { Level } from '../Level.mjs'
import { rawAssertNotZero } from '../Asserts.mjs'

// import { builtin_sandbox } from './builtins/sandox'

export type Constructor<T = {}> = new (...args: any[]) => T;


const {lub} = levels

class RtEnv {
    _is_rt_env: boolean;
    constructor() {
        this._is_rt_env = true;
    }
}

class LibEnv {
    ret: any;
    _is_rt_env: boolean
    constructor() {
        this._is_rt_env = false;
        this.ret = null;
    }
}


export function mkBuiltin(f,name=null) {
    return BuiltinFunction(f,name)
}

export function mkService(f, name = null) {
    return ServiceFunction(f, name)
}

/**
 * Exposes functions available to generated code, used by the Stack2JS module.
 * (TODO: Categorize into assertions, special instructions and general instructions, e.g. using interfaces.
 * Separate from other functions not used by generated code.)
 * Functions used by the generated code are either "SimpleRT" or "ComplexRT" functions (and marked accordingly),
 * where the former just return a plain value which by the generated code is embedded
 * into a labelled value, and the latter return a labelled value, where the label
 * is used by the generated code to compute the eventual label. All operations take plain values as arguments
 * (and not labelled values) unless otherwise noted.
 * Functions marked with "SpecialRT" do not work on values and are special control instructions.
 */
export class UserRuntimeZero {
    runtime: RuntimeInterface
    
    mkuuid: any
    // SimpleRT with array of labelled values as parameter
    mkRecord = mkRecord
    // SimpleRT with array of labelled values as parameter
    mkTuple = mkTuple
    // SimpleRT with array of labelled values as parameter
    mkList = mkList
    sandbox: any
    sleep: any

    Env = RtEnv
    RawClosure = RawClosure    
    constructLVal =  (x,y,z) => new LVal (x,y,z) 
    mkVal : (x:any) => LVal = this.default_mkVal
    mkValPos : (x:any, pos:string) => LVal = this.default_mkValPos
    __unit = unitLVal
    __unitbase = RawUnit
    Atom = RawAtom

    constructor(runtime:RuntimeInterface) {                  
        this.runtime = runtime
    }


    debug (x) {
        this.runtime.debug(x);
    }

    ret (x) {
        this.runtime.ret (x)
    }

    // SimpleRT
    raw_join(...xs) : Level {
        return lub.apply (null, xs)
    }

    // SpecialRT
    raw_invalidateSparseBit() {
        this.runtime.$t.invalidateSparseBit()
    }

    // SpecialRT
    rawErrorPos(x: RawValue, pos: string) {
        if (pos != '') {
            this.runtime.$t.threadError(x + " at " + pos);
        } else {
            this.runtime.$t.threadError("" + x);
        }
    }

    // ComplexRT
    eq(x: RawValue, y: RawValue): LVal {
        return isEqual(x, y)
    }

    // ComplexRT
    neq(x: RawValue, y: RawValue): LVal {
        let b = isEqual(x, y);
        b.val = !b.val;
        return b;
    }

    // SimpleRT
    intdiv(x: number, y: number): number {
        return Math.trunc(x / y)
    }

    // SimpleRT
    rawAssertNotZero = rawAssertNotZero

    // ComplexRT
    raw_indexTuple(x: RawValue, y: number): LVal {
        return x[y];
    }

    // SimpleRT
    raw_islist(x: RawValue): boolean {
        return isList(x);
    }

    // SimpleRT
    raw_istuple(x: RawValue): boolean {
        return isTuple(x);
    }

    // ComplexRT
    getField(x: RawRecord, f: string): LVal {
        return x.getField(f)
    }

    // SimpleRT
    hasField(x: RawRecord, f: string): boolean {
        return x.hasField(f)
    }

    // SimpleRT
    isRecord(x: RawValue): boolean {
        return isRecord(x);
    }

    // SimpleRT
    withRecord(r: RawRecord, fields: Array<[string, LVal]>): RawRecord {
        return mkWithRecord(r, fields)
    }

    // SimpleRT
    cons(a: LVal, b: RawList): RawList {
        return new Cons(a, b)
    }

    // SimpleRT
    raw_listLength(x: RawList): number {
        return x.length
    }

    // SimpleRT
    raw_tupleLength(x: RawTuple): number {
        return x.length
    }

    // SimpleRT
    raw_recordSize(x: RawRecord): number {
        return x.__obj.size
    }

    // ComplexRT
    head(x: RawList): LVal {
        return x.head;
    }

    // SimpleRT
    tail(x: RawList): RawList {
        return x.tail
    }

    // SimpleRT
    mkV1Label(x: string): Level {
        return levels.mkV1Level(x)
    }

    mkDCLabel(x:any):Level {
        return levels.mkLevel(x);
    }

    /**
     * ComplexRT.
     * Lookup a definition from a library.
     * @param lib the library
     * @param decl the declaration to look up
     * @param obj the object to store the result in, under "libs["lib.decl"]"
     * @returns the unlabelled value from the definition
     */
    loadLib(lib: string, decl: string, obj: { libs: { [x: string]: any } }): any {
        // load the lib from the linked data structure
        let r = obj.libs[lib + "." + decl];
        // rt_debug("loading lib " + decl);
        return r;
    }


    /*
     * ==============================================================
     * The remaining functions are not referred to by generated code.
     * ==============================================================
     */
    
    branch = function (x) {
        this.runtime.$t.setBranchFlag()
        this.runtime.$t.raiseCurrentThreadPC(x.lev);
    }

    push(x, frameSize) {
        this.runtime.$t.pushFrame(x, frameSize);
    }

    assertOrError(x) {
        this.runtime.$t.raiseBlockingThreadLev(x.lev);
    }

    default_mkVal(x) {
        return this.runtime.$t.mkVal(x)        
    }

    default_mkValPos(x,p) {
        return this.runtime.$t.mkValPos(x, p)
    }

    mkCopy (x):LVal {
        return this.runtime.$t.mkCopy(x)
    }


    libLoadingPseudoThread = new Thread(null, null, null, unitLVal, levels.BOT, levels.BOT, null, this, null);
    savedThread =  null ;// this.runtime.__sched.getCurrentThread();
    setLibloadMode() {
        this.mkVal = (x) => new LVal(x, levels.BOT);
        this.mkValPos = (x, pos) => new LVal(x, levels.BOT, levels.BOT, pos);
        this.Env = LibEnv;
        this.savedThread = this.runtime.__sched.setCurrentThread(this.libLoadingPseudoThread);
    }


    setNormalMode() {
        this.mkVal = this.default_mkVal;
        this.mkValPos = this.default_mkValPos
        this.Env = RtEnv;
        this.runtime.__sched.setCurrentThread(this.savedThread);
    }

    // tailcall(lff, arg) {    
    //     this.runtime.tailcall (lff, arg)
    // }

    // raw_tailcall(x) {
    //     this.runtime.__sched.tailToTroupeFun_raw (x);
    // }


    async linkLibs (f) {
        await loadLibsAsync(f, this)
    }

    errorPos (x: { val: string }, pos: string) {
        if (pos != '') {
            this.runtime.$t.threadError(x.val + " at " + pos);
        } else {
            this.runtime.$t.threadError(x.val);
        }    
    }

}



