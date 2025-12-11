import {ClosureType, TroupeType} from './TroupeTypes.mjs'
import {TroupeFunction} from './TroupeValue.mjs'
import {BOT} from '../Level.mjs'
import { getRuntimeObject } from '../SysState.mjs'

export interface BuiltinFunction extends TroupeFunction {
  env: null;
  (LVal): any;

  _troupeType: TroupeType.Closure;
  _closureType: ClosureType.BuiltinFn;
}

export function BuiltinFunction(fn: (LVal) => any, name: string | null = null) : BuiltinFunction {
  const closure : BuiltinFunction = () => fn(getRuntimeObject().$t.arg_as_lval);

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.Closure;
  closure._closureType = ClosureType.BuiltinFn;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export interface ServiceFunction extends TroupeFunction {
  env: null;
  (): any;

  _troupeType: TroupeType.Closure;
  _closureType: ClosureType.ServiceFn;
}

export function ServiceFunction(fn: () => any, name: string | null = null) : ServiceFunction {
  const closure : ServiceFunction = () => fn();

  closure.env = null;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: 2025-07-28;AA (this is likely redundant)
  closure._troupeType = TroupeType.Closure;
  closure._closureType = ClosureType.ServiceFn;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => `<basefun:${name || "_"}>`;
  closure.toString  = closure.stringRep;

  return closure;
}


export interface SandboxResumption extends TroupeFunction {
  (): any;

  _troupeType: TroupeType.Closure;
  _closureType: ClosureType.SandboxKont;
}

export function SandboxResumption(fn: () => any) : SandboxResumption {
  const closure: SandboxResumption = () => fn();

  // TODO: closure.env = ???;
  // TODO: closure.namespace = ???;
  closure.fun = fn; // TODO: redundant?
  closure._troupeType = TroupeType.Closure;
  closure._closureType = ClosureType.SandboxKont;
  closure.dataLevel = BOT;

  closure.stringRep = (ol = false, tr = null) => "<sandboxkont>";
  closure.toString  = closure.stringRep;

  return closure;
}