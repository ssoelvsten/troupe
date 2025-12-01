import { Level } from './Level.mjs';
import { LVal, listStringRep } from './Lval.mjs';
import { TroupeAggregateRawValue } from './TroupeRawValue.mjs';
import { TroupeType } from './TroupeTypes.mjs';
import * as levels from './Level.mjs'

export class RawTuple extends Array<LVal> implements TroupeAggregateRawValue {
  dataLevel: Level;
  _troupeType = TroupeType.TUPLE;
  isTuple = true;
  stringRep = null;

  constructor(xs: LVal[]) {
    super(...xs)
    this.stringRep = function (omitLevels = false, taintRef = null) {
      return ("(" + listStringRep(xs, omitLevels, taintRef) + ")");
    };

    let dataLevels = xs.map(x => x.dataLevel);
    this.dataLevel = levels.lubs.call(null, dataLevels);
  }
}
