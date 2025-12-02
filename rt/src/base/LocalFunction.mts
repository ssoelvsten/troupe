import {ClosureType, TroupeType} from './TroupeTypes.mjs'
import {RawFunction} from './RawValue.mjs'
import {BOT} from '../Level.mjs'
import { getRuntimeObject } from '../SysState.mjs'

export interface BuiltinFunction extends RawFunction {
  env: null;
  (LVal): any;

  _troupeType: TroupeType.CLOSURE;
  _closureType: ClosureType.BUILTINFN;
}

export function BuiltinFunction(fn: (LVal) => any, name: string | null = null) : BuiltinFunction {
  const closure : BuiltinFunction = () => fn(getRuntimeObject().$t.arg_as_lval);

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.BUILTINFN;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export interface ServiceFunction extends RawFunction {
  env: null;
  (): any;

  _troupeType: TroupeType.CLOSURE;
  _closureType: ClosureType.SERVICEFN;
}

export function ServiceFunction(fn: () => any, name: string | null = null) : ServiceFunction {
  const closure : ServiceFunction = () => fn();

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.SERVICEFN;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export interface SandboxResumption extends RawFunction {
  (): any;

  _troupeType: TroupeType.CLOSURE;
  _closureType: ClosureType.SANDBOXKONT;
}

export function SandboxResumption(fn: () => any) : SandboxResumption {
  const closure: SandboxResumption = () => fn();

  // TODO: closure.env = ???;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: redundant?
  closure._troupeType = TroupeType.CLOSURE;
  closure._closureType = ClosureType.SANDBOXKONT;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => "<sandboxkont>";
  closure.toString  = closure.stringRep;

  return closure;
}