import {UserRuntimeZero, Constructor, mkBase, mkService} from './UserRuntimeZero.mjs'
import { unitLVal } from '../base/unitLVal.mjs'
export function BuiltinService <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        _servicetest = mkService(() => this.runtime.$service.servicetest(),"servicetest")
    }
}