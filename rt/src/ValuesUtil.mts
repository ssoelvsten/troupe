import { LVal } from './Lval.mjs'
import { RawList } from './RawList.mjs'
import { RawRecord } from './RawRecord.mjs';
import { RawTuple } from './RawTuple.mjs'
import { TroupeType } from './TroupeTypes.mjs';

/**
 * Takes an array of labelled values and makes a new Troupe tuple object out of it.
 */
export function mkTuple(x: LVal[]) {
  return new RawTuple(x)
}

/** Predicate of whether `x` is a Troupe tuple object. */
export function isTupleFlagSet(x: any): x is RawTuple {
  return x._troupeType === TroupeType.TUPLE;
}

/**
 * Takes an array of labelled values and makes a new Troupe list object out of it.
 */
export function mkList(a: LVal[]) {
  return RawList.fromArray(a);
}

/** Predicate of whether `x` is a Troupe list object. */
export function isListFlagSet(x: any): x is RawList {
  return x._troupeType === TroupeType.LIST;
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
  return x._troupeType === TroupeType.RECORD;
}
