'use strict'
import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import { assertIsNTuple, assertIsRecord, assertIsString, assertIsUnit, assertNormalState } from '../Asserts.mjs'
import { RawRecord } from "../base/RawRecord.mjs";
import { lub } from '../Level.mjs';
import { unitLVal } from '../base/unitLVal.mjs';
import { TroupeType } from '../base/TroupeTypes.mjs';

export function BuiltinTypeInformation<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {        
	// returns a string containing the type information 
        getType = mkBuiltin((larg) => {
	     let _t = "unknown" // 2024-03-18; todo: add proper type	
	     switch (larg.val._troupeType) {
		case TroupeType.Unit: 
			_t = "unit";
			break;
		case TroupeType.Boolean: 
			_t = "boolean";
			break;
		case TroupeType.Number: 
			_t = "number";
			break;
				
		case TroupeType.String: 
			_t = "string";
			break;
		case TroupeType.ProcessId: 
			_t = "process_id";
			break;
		case TroupeType.Level: 
			_t = "level";
			break;
		case TroupeType.Authority: 
			_t = "authority";
			break;
		case TroupeType.Closure: 
			_t = "function";
			break;
		case TroupeType.Tuple: 
			_t = "tuple";
			break;
		case TroupeType.List: 
			_t = "list";
			break;
		case TroupeType.Record: 
			_t = "record";
			break;
		case TroupeType.LocalObject: 
			_t = "localobject";
			break;
		default:
			switch (typeof larg.val)  {
				case 'string':
					_t = "string";
					break;
				case 'number':
					_t = "number";
					break;
				case 'boolean':
					_t = "boolean"
					break;
			}
	     }
	     return this.runtime.ret (
		 new LVal ( _t
			  , lub (larg.tlev, this.runtime.$t.pc)
			  , this.runtime.$t.pc)
	     )



        })
    }
}
