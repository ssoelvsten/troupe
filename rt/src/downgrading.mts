import { LCopyVal } from './Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from './Asserts.mjs'
import { __unit } from './UnitVal.mjs';
import { lub, flowsTo, okToDeclassify, okToEndorse, okToCrossDimensionalDowngrade}  from './Level.mjs'
import { DowngradeResult, DowngradeDimension, DowngradeErrorReason, DowngradeKind } from './DowngradeEnums.mjs';
import {
    formatIntegrityMismatchMsg,
    formatConfidentialityMismatchMsg,
    formatPiniBlockingLevelMismatchMsg,
    formatValueInsufficientAuthorityMsg,
    formatRobustnessViolationMsg,
    formatTransparencyViolationMsg
} from './DowngradeFormatter.mjs';
import { ErrorKind } from './TroupeError.mjs';


function stringOfDowngrader (d: DowngradeDimension): string {
    switch (d) {
        case DowngradeDimension.CONFIDENTIALITY: {
            return "declassification"
        }
        case DowngradeDimension.INTEGRITY: {
            return "endorsement"
        }
        case DowngradeDimension.BOTH: {
            return "downgrade"
        }
    }
}

export function downgrader (runtime, dimension:DowngradeDimension) {
    return (arg => {
            assertIsNTuple(arg, 3);
            let argv = arg.val;
            let data = argv[0];
            let auth = argv[1];
            assertIsAuthority(auth);
            let toLevV = argv[2];
            assertIsLevel(toLevV);

            // 2026-03-03; AA & SS
            //   Downgrade succeeds based on the level of `data` and the value of the authority and
            //   the to-level. The secrecy/integrity of their values are in their levels.
            //
            // TODO: Assert taint on authority?
            runtime.$t.raiseBlockingThreadLev(lub (data.lev, auth.lev, toLevV.lev));

            let pc = runtime.$t.pc;
            let levFrom = data.lev;
            let bl = runtime.$t.bl;
            let isNMIFC = runtime.$t.isNmifcMode;
            let lev_to = toLevV.val
            const downgradeKindString = stringOfDowngrader (dimension)

            const dg_f =
                dimension == DowngradeDimension.CONFIDENTIALITY ? okToDeclassify :
                dimension == DowngradeDimension.INTEGRITY ? okToEndorse :
                okToCrossDimensionalDowngrade;
            const ok_to_downgrade_result: DowngradeResult =
                dg_f(levFrom, lev_to, auth.val.authorityLevel, bl, isNMIFC, pc)

            if (ok_to_downgrade_result.kind === "SUCCESS") {
                let r = new LCopyVal(data, lub(lev_to, pc, arg.lev, auth.lev, toLevV.lev));
                return runtime.ret(r)
            } else {
                let errorMessage = "";
                switch (ok_to_downgrade_result.reason) {
                    case DowngradeErrorReason.INTEGRITY_MISMATCH:
                        errorMessage = formatIntegrityMismatchMsg(downgradeKindString, levFrom, lev_to);
                        break;
                    case DowngradeErrorReason.CONFIDENTIALITY_MISMATCH:
                        errorMessage = formatConfidentialityMismatchMsg(downgradeKindString, levFrom, lev_to);
                        break;
                    case DowngradeErrorReason.BLOCKING_LEVEL_MISMATCH:
                        errorMessage = formatPiniBlockingLevelMismatchMsg(downgradeKindString, bl, lev_to);
                        break;
                    case DowngradeErrorReason.INSUFFICIENT_AUTHORITY:
                        errorMessage = formatValueInsufficientAuthorityMsg(downgradeKindString, levFrom, auth.val.authorityLevel, lev_to);
                        break;
                    case DowngradeErrorReason.ROBUSTNESS_VIOLATION:
                        errorMessage = formatRobustnessViolationMsg(downgradeKindString, levFrom, lev_to, pc, DowngradeKind.VALUE);
                        break;
                    case DowngradeErrorReason.TRANSPARENCY_VIOLATION:
                        errorMessage = formatTransparencyViolationMsg(downgradeKindString, levFrom, lev_to, pc, DowngradeKind.VALUE);
                        break;
                    default:
                        const _exhaustiveCheck: never = ok_to_downgrade_result.reason;
                        errorMessage = `Unhandled downgrade error reason: ${_exhaustiveCheck} for ${downgradeKindString}`;
                }
                runtime.$t.threadError(errorMessage, false, null, ErrorKind.IFCCheck);
            }
        })
}
