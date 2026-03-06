import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { __unit } from '../UnitVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeDimension, ValueDowngradeGranularity } from '../DowngradeEnums.mjs';

export function BuiltinDeclassify<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        endorse = mkBase
            ( downgrader (this.runtime, DowngradeDimension.INTEGRITY)
            , "endorse")

        endorseType = mkBase
            ( downgrader (this.runtime, DowngradeDimension.INTEGRITY, ValueDowngradeGranularity.TYPE_ONLY)
            , "downgradeType")

        declassify = mkBase
            ( downgrader (this.runtime, DowngradeDimension.CONFIDENTIALITY)
            , "declassify")

        declassifyType = mkBase
            ( downgrader (this.runtime, DowngradeDimension.CONFIDENTIALITY, ValueDowngradeGranularity.TYPE_ONLY)
            , "downgradeType")

        // Cross-dimensional downgrade: changes both confidentiality and integrity
        downgrade = mkBase
            ( downgrader (this.runtime, DowngradeDimension.BOTH)
            , "downgrade")

        downgradeType = mkBase
            ( downgrader (this.runtime, DowngradeDimension.BOTH, ValueDowngradeGranularity.TYPE_ONLY)
            , "downgradeType")
    }
}
