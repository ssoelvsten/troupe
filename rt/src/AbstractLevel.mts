import { TroupeType } from "./TroupeTypes.mjs";
import { TroupeRawValue } from "./TroupeRawValue.mjs";
// import levels from './options';

export abstract class AbstractLevel implements TroupeRawValue {
  isLevel: boolean = true ;
  _troupeType: TroupeType = TroupeType.LEVEL
  abstract dataLevel;
  abstract stringRep (): string 
}


export interface LevelSystem <L extends AbstractLevel> {
  BOT: L
  TOP: L 
  NULL: L 
  ROOT: L 
  mkLevel (x:string) : L 
  lub (...ls:L[]): L 
  glb2 (a:L, b:L): L 
  flowsTo (a: L, b:L) : boolean 
  lubs (arr: L[]) : L 
}

