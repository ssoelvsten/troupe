import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { __unit } from '../UnitVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeDimension } from '../DowngradeEnums.mjs';

export function BuiltinDeclassify<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        endorse = mkBase
            ( downgrader (this.runtime, DowngradeDimension.INTEGRITY)
            , "endorse")


        declassify = mkBase
            ( downgrader (this.runtime, DowngradeDimension.CONFIDENTIALITY)
            , "declassify")

        // Cross-dimensional downgrade: changes both confidentiality and integrity
        downgrade = mkBase
            ( downgrader (this.runtime, DowngradeDimension.BOTH)
            , "downgrade")
    }
}