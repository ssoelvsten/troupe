import { Thread, Capability } from './Thread.mjs';

import { isAuthority, isBoolean, isList, isNumber, isProcessID, isString, isTuple, isUnit } from './base/rawUtil.mjs';
import { AbstractLevel } from './AbstractLevel.mjs';
import { Level } from './Level.mjs';
import * as levels from './Level.mjs'; 
import { TroupeType } from './base/TroupeTypes.mjs';
const actsFor = levels.actsFor;

import { getRuntimeObject } from './SysState.mjs';
import { __nodeManager } from './NodeManager.mjs';
import { RawAggregate, RawValue } from './base/RawValue.mjs';
import { LVal } from './base/LVal.mjs';

function _thread() {
    return getRuntimeObject().__sched.getCurrentThread();
}

function __stringRep(v: any) {
    if (v.stringRep) {
        return v.stringRep();
    } else if (typeof v === 'string') {
        return `"${v.toString()}"`;
    } else {
        return v.toString();
    }
}

function err(errorMessage: string, internal: boolean = false) {
    _thread().threadError(errorMessage, internal);
}

// ----------------------------------------------------------------------------
// Base Type Assertions (in the same order as `base/TroupeTypes.mts`)

// UNIT

export function rawAssertIsUnit(x: any) {
    if (!isUnit(x)) {
        err(`value ${__stringRep(x)} is not unit`);
    }
}

export function assertIsUnit(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsUnit(x.val);
}

// BOOLEAN

export function rawAssertIsBoolean(x: any) {
    if (!isBoolean(x)) {
        err(`value ${__stringRep(x)} is not a boolean`);
    }
}

export function assertIsBoolean(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsBoolean(x.val);
}

// NUMBER

export function rawAssertIsNumber(x: any) {
    if (!isNumber(x)) {
        err(`value ${__stringRep(x)} is not a number`);
    }
}

export function assertIsNumber(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsNumber(x.val);
}

export function rawAssertNotZero(x:any) {
    if (x === 0) {
        err("Division by zero error");
    }
}

// STRING

export function rawAssertIsString(x:any) {
    if (!isString(x)) {
        err(`value ${__stringRep(x)} is not a string`);
    }
}

export function assertIsString(x: any) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsString(x.val);
}

// PROCESS ID

export function assertIsProcessId(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!(isProcessID(x.val))) {
        err(`value ${__stringRep(x)} is not a process id`);
    }
}

// LEVEL

export function rawAssertIsLevel (x: any) {
    if (!(x instanceof AbstractLevel)) {
        err(`value ${__stringRep(x)} is not a level`);
    }
}

export function assertIsLevel(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!(x.val instanceof AbstractLevel)) {
        err(`value ${__stringRep(x)} is not a level`);
    }
}

// AUTHORITY

export function assertIsAuthority(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!(isAuthority(x.val))) {
        err(`value ${__stringRep(x)} is not a authority`);
    }
}

export function assertIsRootAuthority(x: LVal) {
    const isTop = actsFor(x.val.authorityLevel, levels.ROOT);
    if (!isTop) {
        const errorMessage =
            "Provided authority is not TOP\n" +
            ` | level of the provided authority: ${x.val.authorityLevel.stringRep()}`;
        err(errorMessage);
    }
}

// CAPABILITY

export function assertIsCapability(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!(x.val instanceof Capability)) {
        err(`value ${__stringRep(x)} is not a capability of lowering the mailbox clearance`);
    }
}

// ATOM

export function rawAssertIsAtom(x: any) {
    if (x._troupeType != TroupeType.Atom ) {
        err (`value ${__stringRep(x)} is not an atom`);
    }
}

export function assertIsAtom(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsAtom(x.val);
}

// ----------------------------------------------------------------------------
// Aggregate Type Assertions (in the same order as `base/TroupeTypes.mts`)

// FUNCTION

export function rawAssertIsFunction(x, internal = false) {
    if (x._troupeType != TroupeType.Closure) {
        err(`value ${__stringRep(x)} is not a function`, internal);
    }
}

export function assertIsFunction(x: any, internal = false) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsFunction(x.val, internal);
}

export function rawAssertIsHandler(x: any) {
    if (x._troupeType != TroupeType.Closure) {
        err(`value ${__stringRep(x)} is not a handler`);
    }
}

export function assertIsHandler(x: any) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsHandler(x.val);
}

// TUPLE

export function rawAssertIsTuple(x: any) {
    if (!(Array.isArray(x) && isTuple(x) )) {
        err(`value ${__stringRep(x)} is not a tuple`);
    }
}

export function assertIsTuple(x: LVal) {
    _thread().raiseBlockingLevel(x.lev);
    rawAssertIsTuple(x.val);
}

export function rawAssertIsNTuple(x: any, n: number) {
    if (!(Array.isArray(x) && isTuple(x) && x.length == n)) {
        err(`value ${__stringRep(x)} is not a ${n}-tuple`);
    }
}

export function assertIsNTuple(x: LVal, n: number) {
    _thread().raiseBlockingLevel(x.lev);
    rawAssertIsNTuple(x.val, n);
}

/**
 * Assumes `x` is a tuple and asserts it has at least length `n`.
 */
export function rawAssertTupleLengthGreaterThan(x, n: number) {
    if (x.length <= n) {
        err(`Index out of bounds: tuple ${__stringRep(x)} does not have length more than ${n}`);
    }
}

// LIST

export function rawAssertIsList(x:any) {
    if (!isList(x)) {
        err(`value ${__stringRep(x)} is not a list`);
    }
}

export function assertIsList(x: LVal) {
    _thread().raiseBlockingLevel(x.lev);;
    rawAssertIsList(x.val)
}

// RECORD

export function rawAssertIsRecord(x: any) {
    if (x._troupeType != TroupeType.Record) {
        err (`value ${__stringRep(x)} is not a record`)
    }
}

export function assertIsRecord(x: LVal) {
    _thread().raiseBlockingLevel(x.lev);
    rawAssertIsRecord(x.val);
}

export function rawAssertRecordHasField(x, field: string) {
    if (!x.hasField(field)) {
        err (`record ${__stringRep(x)} does not have field '${field}'`)
    }
}

// ----------------------------------------------------------------------------
// Local Object Assertions

export function rawAssertIsLocalObject(x: any) {
    if (x._troupeType != TroupeType.LocalObject) {
        err(`value ${__stringRep(x)} is not a local object`);
    }
}

export function assertIsLocalObject(x: any) {
    _thread().raiseBlockingLevel(x.tlev);
    rawAssertIsLocalObject(x.val);
}

// ----------------------------------------------------------------------------
// Other...

export function assertIsNode(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!isString(x.val)) {
        // todo: check for it being a proper nodeid format?
        err(`value ${__stringRep(x)} is not a node string`);
    }
    if (x.val.startsWith("@")) {
        if (!__nodeManager.aliases[x.val.substring(1)]) {
            err(`${x.val} is not a defined alias`);
        }
    }
}

export function assertIsEnv(x: LVal) {
    _thread().raiseBlockingLevel(x.tlev);
    if (!(x.val._is_rt_env)) {
        err(`value ${__stringRep(x)} is not an environment`);
    }
}

export function assertNormalState(s: string) {
    if (!_thread().handlerState.isNormal()) {
        err(`invalid handler state in ${s} -- side effects are prohbited in handler pattern matching or sandboxed code`);
    }
}

export function assertDeclassificationAllowed(s: string) {
    if (!_thread().handlerState.declassificationAllowed()) {
        err(`invalid handler state in ${s}: declassification prohibited in handler pattern matching`);
    }
}

export function rawAssertPairsAreStringsOrNumbers (x:any, y:any) {
    switch (typeof x) {
        case 'number': rawAssertIsNumber(y); break;
        case 'string': rawAssertIsString(y); break;
        default: err(`value ${__stringRep(x)} is not a number or a string`);
    }
}
