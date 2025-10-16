import { LCopyVal } from './Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from './Asserts.mjs';
import { __unit } from './UnitVal.mjs';
import { lub, flowsTo, okToDeclassify, okToEndorse}  from './Level.mjs';
import { DowngradeResult, DowngradeDimension, DowngradeErrorReason } from './DowngradeEnums.mjs';
import {
    formatIntegrityMismatchMsg,
    formatConfidentialityMismatchMsg,
    formatPiniBlockingLevelMismatchMsg,
    formatValueInsufficientAuthorityMsg
} from './DowngradeFormatter.mjs';


function stringOfDowngrader (d) {
    switch (d) {
        case DowngradeDimension.CONFIDENTIALITY: {
            return "declassification";
        }
        case DowngradeDimension.INTEGRITY: {
            return "endorsement";
        }
    }
}

export function downgrader (runtime, dimension:DowngradeDimension, isNMIFC: boolean ) {
    return (arg => {
            assertIsNTuple(arg, 3);
            const argv = arg.val;
            const data = argv[0];
            const auth = argv[1];
            assertIsAuthority(auth);
            const toLevV = argv[2];
            assertIsLevel(toLevV);
            const pc = runtime.$t.pc;
            const levFrom = data.lev;
            const bl = runtime.$t.bl ;
            const lev_to = toLevV.val;
            const downgradeKindString = stringOfDowngrader (dimension);

            const dg_f =
                dimension == DowngradeDimension.CONFIDENTIALITY ? okToDeclassify : okToEndorse;
            const ok_to_downgrade_result: DowngradeResult =
                dg_f(levFrom, lev_to, auth.val.authorityLevel, bl, isNMIFC);

            if (ok_to_downgrade_result.kind === "SUCCESS") {
                const r = new LCopyVal(data, lub(lev_to, pc, arg.lev, auth.lev));
                return runtime.ret(r);
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
                    default:
                        const _exhaustiveCheck: never = ok_to_downgrade_result.reason;
                        errorMessage = `Unhandled downgrade error reason: ${_exhaustiveCheck} for ${downgradeKindString}`;
                }
                runtime.$t.threadError(errorMessage);
            }
        });
}
