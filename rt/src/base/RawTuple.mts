import { Level } from '../Level.mjs';
import { LVal, listStringRep } from './LVal.mjs';
import { TroupeAggregateRawValue } from './TroupeRawValue.mjs';
import { TroupeType } from './TroupeTypes.mjs';
import * as levels from '../Level.mjs'

export class RawTuple extends Array<LVal> implements TroupeAggregateRawValue {
  dataLevel: Level;
  _troupeType = TroupeType.TUPLE;
  stringRep = null;

  constructor(xs: LVal[]) {
    super(...xs);

    // HACK: This member definition is currently in the constructor to have
    //       access to `xs`. One cannot move it out, since that would break
    //       `xs.map` in `listStringRep(this, ...)`; the inherited `map` is
    //       designed to use the child's (`RawTuple`) constructor rather than
    //       the one of `super` (`Array`).
    this.stringRep = function (omitLevels = false, taintRef = null) {
      return `(${listStringRep(xs, omitLevels, taintRef)})`;
    };

    let dataLevels = xs.map(x => x.dataLevel);
    this.dataLevel = levels.lubs.call(null, dataLevels);
  }
}
