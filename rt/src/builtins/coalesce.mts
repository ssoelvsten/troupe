import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LVal } from '../Lval.mjs';
import { lub, coalesce } from '../Level.mjs'
import { Authority } from '../Authority.mjs';
import { assertIsNTuple, assertIsAuthority } from '../Asserts.mjs'

export function BuiltinCoalesce<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        coalesce = mkBase((arg) => {
            assertIsNTuple(arg, 2);
            let argv = arg.val;
            let auth1 = argv[0];
            let auth2 = argv[1];

            assertIsAuthority(auth1);
            assertIsAuthority(auth2);

            // Coalesce: ⟨S₁, I₁⟩ ⊛ ⟨S₂, I₂⟩ = ⟨S₁ ∧ S₂, I₁ ∧ I₂⟩
            // Combines two authorities using conjunction on both components
            let l1 = auth1.val.authorityLevel;
            let l2 = auth2.val.authorityLevel;
            let combinedLevel = coalesce(l1, l2);

            // Meta-level is the LUB of all security labels involved
            let l_meta = lub(this.runtime.$t.pc, arg.lev, auth1.lev, auth2.lev);

            let result = new LVal(new Authority(combinedLevel), l_meta);
            return this.runtime.ret(result);
        }, "coalesce")
    }
}
