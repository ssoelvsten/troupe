'use strict'
import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import { hash } from '../base/lvalUtil.mjs';


export function BuiltinHash<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        sha256 = mkBuiltin((arg: LVal) => {
            const h = hash(arg, { omitLevels: true });
            const r = this.runtime.$t.mkCopy(h);
            return this.runtime.ret(r);
        }, "hash");

        sha256L = mkBuiltin((arg: LVal) => {
            const h = hash(arg);
            const r = this.runtime.$t.mkCopy(h);
            return this.runtime.ret(r);
        }, "hashL");
    }
}
