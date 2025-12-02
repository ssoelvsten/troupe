import {ClosureType, TroupeType} from './TroupeTypes.mjs'
import {RawAggregate} from './RawValue.mjs'
import * as levels from '../Level.mjs' 
import { getRuntimeObject } from '../SysState.mjs'

export function BuiltinFunction(fn: (LVal) => any, name: string | null = null) : RawAggregate {
  let closure : any = () => {
    let thread = getRuntimeObject().$t;
    return fn (thread.arg_as_lval);
  }
  closure.env = null;
  closure.fun = fn // TODO: 2025-07-28;AA (this is likely redundant) 
  closure._troupeType = TroupeType.CLOSURE; 
  closure._closureType = ClosureType.BUILTINFN;
  closure.stringRep = () => {
    if (name) {
      return `<basefun:${name}>`
    } else {
      return "<basefun:_>"
    }
  }    
  closure.dataLevel = levels.BOT; 
  return closure;
}

  
export function ServiceFunction(fn: () => any, name: string | null = null) : RawAggregate {
  let closure : any = () => fn();
  closure.env = null;
  closure.fun = fn // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.CLOSURE; 
  closure._closureType = ClosureType.SERVICEFN;
  closure.stringRep = () => {
    if (name) {
      return `<basefun:${name}>`
    } else {
      return "<basefun:_>"
    }
  }    
  closure.dataLevel = levels.BOT; 
  return closure;  
}


export function SandboxResumption(fn: () => any) : RawAggregate {
  let closure: any = () => {
    return fn();
  };

  closure.fun = fn // TODO: redundant?
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.SANDBOXKONT;
  closure.stringRep  = (omitLevels = false ) => {
    return "<sandboxkont>";
  };

  closure.dataLevel = levels.BOT;
  closure.toString = () => {
    return ("<sandboxkont>")
  };

  return closure;
}