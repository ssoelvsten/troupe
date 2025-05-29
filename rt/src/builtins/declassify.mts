import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { __unit } from '../UnitVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeDimension } from '../levels/DCLabels/dclabel.mjs';

export function BuiltinDeclassify<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        endorse = mkBase
            ( downgrader (this.runtime, DowngradeDimension.INTEGRITY, false)
            , "endorse")


        declassify = mkBase
            ( downgrader (this.runtime, DowngradeDimension.CONFIDENTIALITY, false)
            , "declassify")
    }
}