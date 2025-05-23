import { TroupeType } from "./TroupeTypes.mjs";
import { TroupeRawValue } from "./TroupeRawValue.mjs";
// import levels from './options';

export abstract class AbstractLevel <T extends AbstractLevel<T>> 
 implements TroupeRawValue {
  isLevel: boolean = true ;
  _troupeType: TroupeType = TroupeType.LEVEL
  abstract dataLevel;
  abstract stringRep (): string 
}