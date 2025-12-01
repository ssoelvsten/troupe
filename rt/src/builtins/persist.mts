import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import * as levels from '../Level.mjs'
import {deserialize} from '../deserialize.mjs'
import * as fs from 'node:fs';
import { assertIsNTuple, assertIsRootAuthority, assertIsString } from '../Asserts.mjs'
import { __unit } from '../base/UnitVal.mjs';

export function BuiltinPersist<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        save = mkBase((larg) => {
            assertIsNTuple(larg, 3);
            this.runtime.$t.raiseCurrentThreadPC(larg.lev);
            let arg = larg.val;
            let auth = arg[0]; 
            let file = arg[1].val;
            let data = arg[2];
            assertIsRootAuthority(auth);
            this.runtime.persist(data, "./out/saved." + file + ".persist.json")
            return this.runtime.ret(__unit);
        }, "save")


        restore = mkBase((arg) => {
            assertIsString(arg)
            let theThread = this.runtime.$t;
            let file = arg;

            (async () => {
                let jsonStr = await fs.promises.readFile("./out/saved." + file.val + ".persist.json", 'utf8');
                let data = await deserialize(levels.TOP, JSON.parse(jsonStr));                
                theThread.returnSuspended(data);
                this.runtime.__sched.scheduleThread(theThread);
                this.runtime.__sched.resumeLoopAsync();

            })()
        }, "restore")

    }

}