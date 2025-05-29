import { LCopyVal } from './Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from './Asserts.mjs'
import { __unit } from './UnitVal.mjs';
import { lub, flowsTo, okToDeclassify, okToEndorse}  from './Level.mjs'
import { DowngradeResult, DowngradeDimension } from './DowngradeEnums.mjs';
import { DC_CONF_LITERALS, DC_INTG_LITERALS } from './levels/DCLabels/dcl_pp_config.mjs';


function stringOfDowngrader (d) {
    switch (d) {
        case DowngradeDimension.CONFIDENTIALITY: {
            return "declassification"
        }
        case DowngradeDimension.INTEGRITY: {
            return "endorsement"
        }
    }
}

export function downgrader (runtime, dimension:DowngradeDimension, isNMIFC: boolean ) {
    return (arg => {
            assertIsNTuple(arg, 3);
            let argv = arg.val;
            let data = argv[0];
            let auth = argv[1];
            assertIsAuthority(auth);
            let toLevV = argv[2];
            assertIsLevel(toLevV);
            let pc = runtime.$t.pc;
            let levFrom = data.lev;
            let bl = runtime.$t.bl ;
            let lev_to = toLevV.val 
            const downgradeKindString = stringOfDowngrader (dimension)

            const dg_f = 
                dimension == DowngradeDimension.CONFIDENTIALITY ? okToDeclassify : okToEndorse;
            const ok_to_downgrade_result: DowngradeResult =
                dg_f(levFrom, lev_to, auth.val.authorityLevel, bl, isNMIFC)

            if (ok_to_downgrade_result === DowngradeResult.SUCCESS) {
                // we need to collect all the restrictions
                let r = new LCopyVal(data, lub(lev_to, pc, arg.lev, auth.lev));
                return runtime.ret(r) // schedule the return value
            } else {
                let errorMessage = `Not enough authority for ${downgradeKindString}`;
                switch (ok_to_downgrade_result) {
                    case DowngradeResult.INTEGRITY_MISMATCH:
                        errorMessage = `Integrity level mismatch for ${downgradeKindString}\n` +
                                      ` | integrity level of the data: ${data.lev.integrity.stringRep(DC_INTG_LITERALS)}\n` +
                                      ` | integrity level of the target: ${lev_to.integrity.stringRep(DC_INTG_LITERALS)}`;
                        break;
                    case DowngradeResult.CONFIDENTIALITY_MISMATCH:
                        errorMessage = `Confidentiality level mismatch for ${downgradeKindString}\n` +
                                      ` | confidentiality level of the data: ${data.lev.confidentiality.stringRep(DC_CONF_LITERALS)}\n` +
                                      ` | confidentiality level of the target: ${lev_to.confidentiality.stringRep(DC_CONF_LITERALS)}`;
                        break;
                    case DowngradeResult.BLOCKING_LEVEL_MISMATCH:
                        errorMessage = `Current blocking level does not flow to the target level of the ${downgradeKindString}\n` +
                                     ` | target level of the ${downgradeKindString}: ${lev_to.stringRep()}\n` +
                                     ` | current blocking level: ${bl.stringRep()}`;
                        break;
                    case DowngradeResult.INSUFFICIENT_AUTHORITY:
                        // errorMessage is already set correctly for this case
                        break;
                }
                if (ok_to_downgrade_result === DowngradeResult.INSUFFICIENT_AUTHORITY) {
                    errorMessage += 
                        `\n | level of the data: ${data.lev.stringRep()}` +
                        `\n | level of the authority: ${auth.val.authorityLevel.stringRep()}` +
                        `\n | target level of the ${downgradeKindString}: ${lev_to.stringRep()}`;
                }
                runtime.$t.threadError(errorMessage);

            }
        })

}
