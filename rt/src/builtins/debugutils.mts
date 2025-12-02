import {UserRuntimeZero, Constructor, mkBuiltin} from './UserRuntimeZero.mjs'
import { assertIsString, assertIsNumber, assertIsNTuple } from '../Asserts.mjs'
import { unitLVal } from '../base/unitLVal.mjs';
import { TroupeType } from '../base/TroupeTypes.mjs';


export function BuiltinDebugUtils <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        _setProcessDebuggingName = mkBuiltin((arg) => {
            assertIsString(arg)
            this.runtime.$t.processDebuggingName = arg.val
            return this.runtime.ret(unitLVal)
        })

        debugpc = mkBuiltin((arg) => {
            this.runtime.debug("");
            // this.runtime.$t.showStack()
            return this.runtime.ret(unitLVal);
        })

        _debug = mkBuiltin ((arg) => {
            console.log (arg.stringRep(true))
            return this.runtime.ret(unitLVal);
        })

        _setFailureRate = mkBuiltin((arg) => {
            let _tt = arg.getTroupeType;
            switch (_tt) {
                case TroupeType.NUMBER:
                    this.runtime.$t.failureRate = arg.val
                    this.runtime.$t.failureStartTime = 0;
                    break;
                case TroupeType.TUPLE:
                    assertIsNTuple(arg, 2)
                    assertIsNumber (arg.val[0])
                    assertIsNumber (arg.val[1])
                    this.runtime.$t.failureRate = arg.val[0].val
                    this.runtime.$t.failureStartTime = Date.now() + arg.val[1].val
                    break;
                default:
                    this.runtime.$t.threadError ("Invalid argument type in function _setFailureRate");
            }            
            return this.runtime.ret(unitLVal);
        })
    }
}

