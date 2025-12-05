import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import * as levels from '../Level.mjs'
import { assertIsNTuple, assertNormalState } from '../Asserts.mjs';
import { unitLVal } from '../base/unitLVal.mjs';
import { getCliArgs, TroupeCliArg } from '../TroupeCliArgs.mjs';

const {lub, flowsTo} = levels
const argv = getCliArgs();

/* 

       ┌────────┐       
       │  TOP   │       
       └────────┘       
            Λ           
           ╱ ╲          
          ╱   ╲         
         ╱     ╲        
        ╱       ╲       
       ╱         ╲      
      ╱           ╲     
     ╱             ╲    
┌────────┐    ┌────────┐
│  NULL  │    │  ROOT  │
└────────┘    └────────┘
     ╲             ╱    
      ╲           ╱     
       ╲         ╱      
        ╲       ╱       
         ╲     ╱        
          ╲   ╱         
           ╲ ╱          
            V           
       ┌────────┐       
       │  BOT   │       
       └────────┘       


*/ 



export function BuiltinAdv <TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        mkSecret = mkBuiltin((x: LVal) => {
            // debug ("making secret " + x.val)
            this.runtime.$t.invalidateSparseBit()
            return this.runtime.ret(new LVal(x.val, levels.TOP))
        })

        adv = mkBuiltin((x: LVal) => {
            assertNormalState("baseDisclose");
            
            // Check if running in network mode (i.e., NOT local-only)
            if (!argv[TroupeCliArg.LocalOnly]) {
                this.runtime.$t.threadError("adv function is disabled in network mode.");
            }
            
            // assert that
            // pc ⊔ x.lev ⊑ NULL

            if (!flowsTo(lub(this.runtime.$t.bl, x.dataLevel), levels.NULL)) {
                this.runtime.$t.
                threadError("Illegal flow in adv function:\n" +
                    ` |    pc: ${this.runtime.$t.pc.stringRep()}\n` +
                    ` | block: ${this.runtime.$t.bl.stringRep()}\n` +
                    ` | value: ${x.stringRep()}`)
            }
            return this.runtime.ret(unitLVal);
        })

        cert = mkBuiltin ((x: LVal) =>{
            assertNormalState("baseCertify");
            
            // Check if running in network mode (i.e., NOT local-only)
            if (!argv[TroupeCliArg.LocalOnly]) {
                this.runtime.$t.threadError("cert function is disabled in network mode.");
            }
            
            // assert that
            // pc ⊔ x.lev ⊑ ROOT

            if (!flowsTo(lub(this.runtime.$t.bl, x.dataLevel), levels.ROOT)) {
                this.runtime.$t.
                threadError("Illegal flow in cert function:\n" +
                    ` |    pc: ${this.runtime.$t.pc.stringRep()}\n` +
                    ` | block: ${this.runtime.$t.bl.stringRep()}\n` +
                    ` | value: ${x.stringRep()}`)
            }
            return this.runtime.ret(unitLVal);            
        })

        ladv = mkBuiltin((x: LVal) => {
            assertNormalState("ladv");
            assertIsNTuple(x, 2)
            let l_adv = x.val[0] 
            let value = x.val[1]
            // assert that
            // pc ⊔ x.lev ⊑ LOW

            if (!flowsTo(lub(this.runtime.$t.bl, value.lev, l_adv.lev), l_adv.val)) {
                this.runtime.$t.
                  threadError("Illegal flow in adv function:\n" +
                    ` |    pc: ${this.runtime.$t.pc.stringRep()}\n` +
                    ` | block: ${this.runtime.$t.bl.stringRep()}\n` +
                    ` | l_adv: ${l_adv.stringRep()} \n` +
                    ` | value: ${value.stringRep()}`)
            }
            return this.runtime.ret(unitLVal);
        })
         
    }
}