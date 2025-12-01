import { BOT } from '../Level.mjs'
import { TroupeType } from './TroupeTypes.mjs';
import { TroupeRawValue } from './TroupeRawValue.mjs'

export class RawUnit implements TroupeRawValue {
  _troupeType = TroupeType.UNIT;
  dataLevel = BOT;
  isUnit = true;

  stringRep(omitLevels: boolean = false, taintRef: any = null) {
    return "()";
  }
}

export const rawUnit = new RawUnit();

export default rawUnit;
