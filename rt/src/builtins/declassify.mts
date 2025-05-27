import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LCopyVal } from '../Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from '../Asserts.mjs'
import { __unit } from '../UnitVal.mjs';
import { lub, flowsTo, okToDowngrade, okToDeclassify, okToEndorse}  from '../Level.mjs'

enum DowngradeKind {
    DECLASSIFY = 1,
    ENDORSE = 2
}

function stringOfDowngrader (d) {
    switch (d) {
        case DowngradeKind.DECLASSIFY: {
            return "declassification"
        }
        case DowngradeKind.ENDORSE: {
            return "endorsement"
        }
    }
}

function downgrader (runtime, kind:DowngradeKind, isNMIFC: boolean ) {
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
            let block_is_low = flowsTo (bl, lev_to)
            const s_dg = stringOfDowngrader (kind)
            if (!block_is_low) {
                let errorMessage = 
                  `Current blocking level does not flow to the target level of the ${s_dg}\n` + 
                     ` | target level of the ${s_dg}: ${lev_to.stringRep()}\n` + 
                     ` | current blocking level: ${bl.stringRep()}`
                runtime.$t.threadError (errorMessage)
            }
 
            const dg_f = 
                kind == DowngradeKind.DECLASSIFY ? okToDeclassify : okToEndorse;
            let ok_to_downgrade =
                dg_f(levFrom, lev_to, auth.val.authorityLevel)

            if (ok_to_downgrade) {
                // we need to collect all the restrictions
                let r = new LCopyVal(data, lub(lev_to, pc, arg.lev, auth.lev));
                return runtime.ret(r) // schedule the return value
            } else {
                let errorMessage =
                    `Not enough authority for ${s_dg}\n` +
                    ` | level of the data: ${data.lev.stringRep()}\n` +
                    ` | level of the authority: ${auth.val.authorityLevel.stringRep()}\n` +
                    ` | target level of the ${s_dg}: ${lev_to.stringRep()}`
                runtime.$t.threadError(errorMessage);

            }
        })

}

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