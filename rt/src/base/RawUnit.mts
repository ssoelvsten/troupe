import { BOT } from '../Level.mjs'
import { TroupeType } from './TroupeTypes.mjs';
import { TroupeValue } from './TroupeValue.mjs'

export class RawUnit implements TroupeValue {
  _troupeType: TroupeType.Unit = TroupeType.Unit;
  dataLevel = BOT;

  stringRep(omitLevels: boolean = false, taintRef: any = null) {
    return "()";
  }
}

export const rawUnit = new RawUnit();

export default rawUnit;
