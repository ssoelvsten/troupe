import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { __unit } from '../UnitVal.mjs';
import { downgrader } from '../downgrading.mjs';
import { DowngradeKind } from '../levels/DCLabels/dclabel.mjs';

export function BuiltinDeclassify<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        endorse = mkBase
            ( downgrader (this.runtime, DowngradeKind.ENDORSE, false)
            , "endorse")


        declassify = mkBase
            ( downgrader (this.runtime, DowngradeKind.DECLASSIFY, false)
            , "declassify")
    }
}