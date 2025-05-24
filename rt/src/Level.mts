import {levels } from './levels/tagsets.mjs'
export { mkLevel, Level } from './levels/tagsets.mjs'

export function lub(...x) { return levels.lub (...x) }
export function lubs(x)   { return levels.lubs (x  ) } 
export function glb(a,b)  { return levels.glb (a,b)  }
export function flowsTo (a,b) { return levels.flowsTo (a,b) }
export const BOT  = levels.BOT
export const TOP  = levels.TOP
export const ROOT = levels.ROOT
export const NULL = levels.NULL
