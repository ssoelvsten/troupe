import {RawAggregate} from './RawValue.mjs'
import {ClosureType, TroupeType} from './TroupeTypes.mjs'

export function RawClosure (env: any, nm: any, fn: any) : RawAggregate {
  let closure:any = () => {    
    return fn (env)
  }
  closure.env=env
  closure.namespace = nm
  closure.fun = fn
  closure._troupeType = TroupeType.CLOSURE
  closure._closureType = ClosureType.REGULARFN
  closure.stringRep  = (omitLevels = false ) => {
    return "fn => .." 
  }
  
  closure.dataLevel = env.__dataLevel
  closure.toString = () => {
    return ("[RawClosure]" + fn.toString ())
  }
  return closure;  
}
