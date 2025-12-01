import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import * as levels from '../Level.mjs'
import { assertIsNTuple, assertNormalState } from '../Asserts.mjs';
import { __unit } from '../base/UnitVal.mjs';
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
        mkSecret = mkBase((x) => {
            // debug ("making secret " + x.val)
            this.runtime.$t.invalidateSparseBit()
            return this.runtime.ret(new LVal(x.val, levels.TOP))
        })

        adv = mkBase((x) => {
            assertNormalState("baseDisclose");
            
            // Check if running in network mode (i.e., NOT local-only)
            if (!argv[TroupeCliArg.LocalOnly]) {
                this.runtime.$t.threadError("adv function is disabled in network mode.");
            }
            
            // assert that
            // pc ⊔ x.lev ⊑ NULL

            if (!flowsTo(lub(this.runtime.$t.bl, x.dlev), levels.NULL)) {
                this.runtime.$t.
                threadError("Illegal flow in adv function:\n" +
                    ` |    pc: ${this.runtime.$t.pc.stringRep()}\n` +
                    ` | block: ${this.runtime.$t.bl.stringRep()}\n` +
                    ` | value: ${x.stringRep()}`)
            }
            return this.runtime.ret(__unit);
        })

        cert = mkBase ((x) =>{
            assertNormalState("baseCertify");
            
            // Check if running in network mode (i.e., NOT local-only)
            if (!argv[TroupeCliArg.LocalOnly]) {
                this.runtime.$t.threadError("cert function is disabled in network mode.");
            }
            
            // assert that
            // pc ⊔ x.lev ⊑ ROOT

            if (!flowsTo(lub(this.runtime.$t.bl, x.dlev), levels.ROOT)) {
                this.runtime.$t.
                threadError("Illegal flow in cert function:\n" +
                    ` |    pc: ${this.runtime.$t.pc.stringRep()}\n` +
                    ` | block: ${this.runtime.$t.bl.stringRep()}\n` +
                    ` | value: ${x.stringRep()}`)
            }
            return this.runtime.ret(__unit);            
        })

        ladv = mkBase((x) => {
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
            return this.runtime.ret(__unit);
        })
         
    }
}