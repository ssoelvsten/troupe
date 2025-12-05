import { Level } from '../Level.mjs';
import { LVal } from './LVal.mjs'
import { RawAtom } from './RawAtom.mjs';
import { RawAuthority } from './RawAuthority.mjs';
import { RawList } from './RawList.mjs'
import { RawProcessID } from './RawProcessID.mjs';
import { RawRecord } from './RawRecord.mjs';
import { RawTuple } from './RawTuple.mjs'
import rawUnit, { RawUnit } from './RawUnit.mjs';
import { TroupeType } from './TroupeTypes.mjs';

/** Combined type of (almost) all possible raw values. */
export type Raw =
  // Base types
  RawUnit | boolean | number | string | RawProcessID | RawAuthority | RawAtom |
  // Aggregate types (TODO: RawClosure)
  RawTuple | RawList | RawRecord;

/**
 * Returns the (raw) Troupe unit object.
 */
export function mkUnit(): RawUnit {
  return rawUnit;
}

/** Predicate of whether `x` is the Troupe unit object. */
export function isUnit(x: any): x is RawUnit {
  return x._troupeType === TroupeType.Unit;
}

/** Predicate of whether `x` is a boolean value. */
export function isBoolean(x: any) : x is boolean {
  return typeof x === "boolean";
}

/** Predicate of whether `x` is a number. */
export function isNumber(x: any) : x is number {
  return typeof x === "number";
}

/** Predicate of whether `x` is a string. */
export function isString(x: any) : x is string {
  return typeof x === "string";
}

/**
 * Combines a `uuid` and process and node identifiers into a new Troupe process
 * id object.
 */
export function mkProcessID(uuid: string | null, pid: string, node: any) {
  return new RawProcessID(uuid, pid, node);
}

/** Predicate of whether `x` is a Troupe process id object. */
export function isProcessID(x : any) : x is RawProcessID {
  return x._troupeType === TroupeType.ProcessId;
}

/**
 * Creates a new Troupe authority object at the given level.
 */
export function mkAuthority(authorityLevel: Level): RawAuthority {
  return new RawAuthority(authorityLevel);
}

/** Predicate of whether `x` is a Troupe authority object. */
export function isAuthority(x: any) : x is RawAuthority {
  return x._troupeType === TroupeType.Authority;
}

/**
 * Combines a `name` and an origin `uuid` in a new Troupe atom object.
 */
export function mkAtom(name: string, uuid?: string) {
  return new RawAtom(name, uuid);
}

/** Predicate of whether `x` is a Troupe atom object. */
export function isAtom(x: any) : x is RawAtom {
  return x._troupeType === TroupeType.Atom;
}

/**
 * Takes an array of labelled values and makes a new Troupe tuple object out of
 * it.
 */
export function mkTuple(x: LVal[]) {
  return new RawTuple(x)
}

/** Predicate of whether `x` is a Troupe tuple object. */
export function isTuple(x: any): x is RawTuple {
  return x._troupeType === TroupeType.Tuple;
}

/**
 * Takes an array of labelled values and makes a new Troupe list object out of
 * it.
 */
export function mkList(a: LVal[]) {
  return RawList.fromArray(a);
}

/** Predicate of whether `x` is a Troupe list object. */
export function isList(x: any): x is RawList {
  return x._troupeType === TroupeType.List;
}

/**
 * Takes an iterable of string-keys and LVal values and makes a new Troupe record
 * object out of it.
 */
export function mkRecord(fields: Iterable<readonly [string, LVal]>): RawRecord {
  return new RawRecord(fields);
}

/**
 * Extends record `r` with the given `fields`.
 */
export function mkWithRecord(r: RawRecord, fields: Array<[string, LVal]>): RawRecord {
  const a = Array.from(r.__obj);
  const b = a.concat(fields);
  return new RawRecord(b)
}

/** Predicate of whether `x` is a Troupe record object. */
export function isRecord(x: any): x is RawRecord {
  return x._troupeType === TroupeType.Record;
}
