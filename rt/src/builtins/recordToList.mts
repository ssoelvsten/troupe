'use strict'
import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { LVal } from '../Lval.mjs';
import { assertIsRecord } from '../Asserts.mjs'
import { Record } from "../Record.mjs";
import { lub } from '../Level.mjs';
import { mkTuple, mkList } from '../ValuesUtil.mjs';

export function BuiltinRecordToList<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        recordToList = mkBase((larg) => {
            assertIsRecord(larg);
            let raw_rec: Record = larg.val;
            let recLabel = larg.lev;

            // Convert Record to list of (key, value) tuples
            // IFC considerations:
            // 1. Field names reveal record structure → label with record's label
            // 2. Values: lub(value's label, record's label)
            // 3. Each tuple: lub(key label, value label)
            // 4. Result list: lub(pc, record label)

            let pairs: LVal[] = [];
            for (let [fieldName, fieldValue] of raw_rec.__obj.entries()) {
                // Key string gets record's label (knowing field names is information)
                let keyLVal = new LVal(fieldName, recLabel);
                // Value's label combined with record label
                let valLVal = new LVal(fieldValue.val, lub(fieldValue.lev, recLabel));
                // Create tuple from key and value
                let tuple = mkTuple([keyLVal, valLVal]);
                // Tuple labeled with lub of key and value labels
                let tupleLVal = new LVal(tuple, lub(keyLVal.lev, valLVal.lev));
                pairs.push(tupleLVal);
            }

            // Build list with label = lub(pc, record label)
            let resultLabel = lub(this.runtime.$t.pc, recLabel);
            let resultList = mkList(pairs);
            return this.runtime.ret(new LVal(resultList, resultLabel));
        }, "recordToList")
    }
}
