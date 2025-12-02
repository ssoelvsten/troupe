import {ClosureType, TroupeType} from './TroupeTypes.mjs'
import {RawAggregate} from './RawValue.mjs'
import * as levels from '../Level.mjs'
import { getRuntimeObject } from '../SysState.mjs'

export function BuiltinFunction(fn: (LVal) => any, name: string | null = null) : RawAggregate {
  const closure : any = () => {
    let thread = getRuntimeObject().$t;
    return fn (thread.arg_as_lval);
  };

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.BUILTINFN;
  closure.dataLevel = levels.BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export function ServiceFunction(fn: () => any, name: string | null = null) : RawAggregate {
  const closure : any = () => fn();

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.SERVICEFN;
  closure.dataLevel = levels.BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export function SandboxResumption(fn: () => any) : RawAggregate {
  const closure: any = () => {
    return fn();
  };

  // TODO: closure.env = ???;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: redundant?
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.SANDBOXKONT;
  closure.dataLevel = levels.BOT;

  closure.stringRep = (ol = false, tr = null) => "<sandboxkont>";
  closure.toString  = closure.stringRep;

  return closure;
}