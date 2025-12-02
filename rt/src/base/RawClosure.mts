import {RawAggregate} from './RawValue.mjs'
import {ClosureType, TroupeType} from './TroupeTypes.mjs'

export function RawClosure (env: any, nm: any, fn: any) : RawAggregate {
  const closure:any = () => {
    return fn (env)
  }

  closure.env = env
  closure.namespace = nm
  closure.fun = fn
  closure._troupeType = TroupeType.CLOSURE
  closure._closureType = ClosureType.REGULARFN
  closure.dataLevel = env.__dataLevel

  closure.stringRep = (ol = false, tr = null) => "fn => ..";
  closure.toString  = () => `[RawClosure]${fn.toString()}`;

  return closure;
}
