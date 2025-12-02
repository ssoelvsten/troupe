import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { unitLVal } from '../base/unitLVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeDimension } from '../DowngradeEnums.mjs';

export function BuiltinDeclassify<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        endorse = mkBuiltin
            ( downgrader (this.runtime, DowngradeDimension.INTEGRITY, false)
            , "endorse")


        declassify = mkBuiltin
            ( downgrader (this.runtime, DowngradeDimension.CONFIDENTIALITY, false)
            , "declassify")
    }
}