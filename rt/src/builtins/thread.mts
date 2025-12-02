import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { assertIsUnit } from '../Asserts.mjs'
import { BOT } from '../Level.mjs';
import { LVal } from '../base/LVal.mjs';

export function BuiltinThread<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
  return class extends Base {
    _blockThread = mkBuiltin ((arg) => {
      assertIsUnit(arg)
      this.runtime.__sched.blockThread(this.runtime.__sched.getCurrentThread());
      return null;
    })

    _pc = mkBuiltin ((arg) => {
      assertIsUnit (arg)
      return this.runtime.ret (
        new LVal (this.runtime.$t.pc, this.runtime.$t.pc, BOT))
    });

    _bl = mkBuiltin ((arg) => {
      assertIsUnit (arg)
      return this.runtime.ret (
        new LVal (this.runtime.$t.bl, this.runtime.$t.bl, BOT))
    });
  };
};
