import { TroupeType } from "./TroupeTypes.mjs";
import { TroupeRawValue } from "./TroupeRawValue.mjs";

export abstract class AbstractLevel <T extends AbstractLevel<T>>
 implements TroupeRawValue {
  isLevel = true ;
  _troupeType: TroupeType = TroupeType.LEVEL;
  abstract dataLevel;
  abstract stringRep (): string
}


export abstract class AbstractLevelSystem <T extends AbstractLevel<T>> {
    abstract BOT : T
    abstract TOP : T
    abstract ROOT : T
    abstract NULL : T
    abstract lub (...ls:T[]) : T
    lubs (ls:T[]) {
        return this.lub(...ls);
    }
    abstract glb (a : T, b: T) : T
    abstract flowsTo (a: T, b: T) : boolean
    abstract actsFor (a: T, b: T) : boolean
}

