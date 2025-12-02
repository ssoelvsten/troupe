import {UserRuntimeZero, Constructor, mkBuiltin} from './UserRuntimeZero.mjs'
import { assertIsLevel, assertIsNTuple, assertIsCapability, assertIsAuthority } from '../Asserts.mjs'


export function BuiltinMboxClear <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        
        raisembox = mkBuiltin((arg) => {
            assertIsLevel(arg);
            return this.runtime.$t.raiseMboxClearance(arg)
        })

        lowermbox = mkBuiltin((arg) => {
            assertIsNTuple(arg, 2);
            assertIsCapability(arg.val[0]);
            assertIsAuthority(arg.val[1]);
            return this.runtime.$t.lowerMboxClearance(arg.val[0], arg.val[1])
        })
         
    }
}


