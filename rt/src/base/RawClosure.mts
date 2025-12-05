import {RawFunction} from './RawValue.mjs'
import {ClosureType, TroupeType} from './TroupeTypes.mjs'

export interface RawClosure extends RawFunction {
  env: any;
  namespace: any;
  (any): any;

  _troupeType: TroupeType.Closure;
  _closureType: ClosureType.RegularFn;
}

export function RawClosure (env: any, nm: any, fn: any) : RawClosure {
  const closure : RawClosure = () => fn(env);

  closure.env = env
  closure.namespace = nm
  closure.fun = fn
  closure._troupeType = TroupeType.Closure
  closure._closureType = ClosureType.RegularFn
  closure.dataLevel = env.__dataLevel

  closure.stringRep = (ol = false, tr = null) => "fn => ..";
  closure.toString  = () => `[RawClosure]${fn.toString()}`;

  return closure;
}
