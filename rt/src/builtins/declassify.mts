import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { __unit } from '../base/UnitVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeDimension } from '../DowngradeEnums.mjs';

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