import { TroupeType } from './TroupeTypes.mjs'
import { BOT, flowsTo, Level, lub } from '../Level.mjs';

import { RawProcessID } from './RawProcessID.mjs';
import { RawRecord } from './RawRecord.mjs';

import { LVal } from './LVal.mjs'

function pidEquality(o1: RawProcessID, o2: RawProcessID) {
  return new LVal(o1.toString() === o2.toString());
}

function levelEquality(o1: Level, o2: Level) {
  return new LVal(flowsTo(o1, o2) && flowsTo(o2, o1));
}

function arrayEquality(o1: Array<LVal<any>>, o2: Array<LVal<any>>) {
  if (o1.length != o2.length) {
    return new LVal(false);
  }

  // Join of the labels of values compared so far
  let l = BOT;
  for (let j = 0; j < o1.length; j++) {
    const z = isEqual(o1[j], o2[j]);
    l = lub(l, z.lev);
    if (!z.val) {
      return new LVal(false, l);
    }
  }
  return new LVal(true, l);
}

function recordEquality(o1: RawRecord, o2: RawRecord) {
  if (o1.__obj.size != o2.__obj.size) {
    return new LVal(false);
  }

  // Join of the labels of values compared so far
  let l = BOT;
  for (let [k, v] of o1.__obj.entries()) {
    if (o2.__obj.has(k)) {
      const u = o2.__obj.get(k);
      const z = isEqual(v, u);
      l = lub(l, z.lev);
      if (!z.val) {
        return new LVal(false, l);
      }
    } else {
      return new LVal(false, l);
    }
  }
  return new LVal(true, l);
}

/**
 * Compute deep equality of the given Troupe values.
 *
 * @returns Whether `x` is equivalent to `y`. The value is labelled to reflect
 *          the accumulated security.
 *
 * @todo: restrict the type of `x` and `y` to be `LVal | Raw`.
 */
export function isEqual(x: any, y: any): LVal<boolean> {
  // If both types are basic types (and not Troupe types), this check will pass
  // and basic comparison with "==" will be used in the default case below.
  if (x._troupeType != y._troupeType) { return new LVal(false); }

  switch (x._troupeType) {
    // Basic Troupe Types
    case TroupeType.Unit:
      return new LVal(true);
    case TroupeType.Atom:
      return new LVal(x.atom == y.atom);
    case TroupeType.ProcessId:
      return pidEquality(x, y);
    case TroupeType.Level:
      return levelEquality(x, y);
    case TroupeType.Authority:
      return levelEquality(x.authorityLevel, y.authorityLevel);

    // Aggregate Troupe Types
    case TroupeType.List:
      return arrayEquality(x.toArray(), y.toArray());
    case TroupeType.Tuple:
      return arrayEquality(x, y);
    case TroupeType.Record:
      return recordEquality(x, y);

    // LVal
    case TroupeType.LVal:
      const z = isEqual(x.val, y.val);
      return LVal.copy(z, lub(x.lev, y.lev));

    // Other Troupe Types
    //
    // TODO (2025-12-11; SS): Should these comparisons not be implemented
    //                        differently than a mere '=='?
    case TroupeType.Closure:
    case TroupeType.LocalObject:
    case TroupeType.Capability:
    // JavaScript Types: `boolean`, `number`, and `string`
    default:
      return new LVal(x == y);
  }
}

export default isEqual;
