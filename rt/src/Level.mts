import {levels, Level } from './levels/DCLabels/dclabel.mjs'
import { DowngradeResult, DowngradeKind, DowngradeDimension } from './DowngradeEnums.mjs'
export { mkLevel, Level } from './levels/DCLabels/dclabel.mjs'


// import {levels } from './levels/tagsets.mjs'
// export { mkLevel, Level } from './levels/tagsets.mjs'

export function lub(...x) { return levels.lub (...x) }
export function glb(a,b)  { return levels.glb (a,b)  }
export function flowsTo (a:Level,b:Level) { return levels.flowsTo (a,b) }
export function actsFor (a:Level,b:Level) { return levels.actsFor (a,b) }
export function okToDowngrade (kind: DowngradeKind, dimension: DowngradeDimension) {
    return levels.okToDowngrade(kind, dimension);
}
export function okToDeclassify (from: Level, to:Level, auth: Level, bl: Level, isNMIFC: boolean): DowngradeResult {
    return levels.okToDeclassify (from,to,auth, bl, isNMIFC);
}
export function okToEndorse (from: Level, to:Level, auth: Level, bl: Level, isNMIFC: boolean): DowngradeResult {
    return levels.okToEndorse (from,to,auth, bl, isNMIFC);
}
export function fromSingleTag(x:string) { return levels.fromV1String(x)}

export function mkV1Level (x:string ) {
	return levels.fromV1String (x);
}
export const BOT  = levels.BOT
export const TOP  = levels.TOP
export const ROOT = levels.ROOT
export const NULL = levels.NULL
