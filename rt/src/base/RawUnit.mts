import { BOT } from '../Level.mjs'
import { TroupeType } from './TroupeTypes.mjs';
import { RawValue } from './RawValue.mjs'

export class RawUnit implements RawValue {
  _troupeType: TroupeType.Unit = TroupeType.Unit;
  dataLevel = BOT;

  stringRep(omitLevels: boolean = false, taintRef: any = null) {
    return "()";
  }
}

export const rawUnit = new RawUnit();

export default rawUnit;
