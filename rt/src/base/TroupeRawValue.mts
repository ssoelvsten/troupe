import { TroupeType } from './TroupeTypes.mjs'
import { Level } from '../Level.mjs'

/**
 * Object with a level to which one can accumulate the information flow level
 * associated with the result of obtaining a value's string representation.
 *
 * @todo Replace this merely returning an `LVal<string>`?
 */
export interface TaintRef {
    lev: Level
}

export interface TroupeRawValue {
    _troupeType: TroupeType;
    dataLevel: Level;
    stringRep (omitLevels?: boolean, taintRef?: TaintRef): string;
}

export interface TroupeAggregateRawValue extends TroupeRawValue {
}
