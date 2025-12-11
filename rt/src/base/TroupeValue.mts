import { ClosureType, TroupeType } from './TroupeTypes.mjs'
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

/**
 * Base type for all Troupe runtime values.
 */
export interface TroupeValue {
    /**
     * The type of the value.
     */
    _troupeType: TroupeType;

    /**
     * The security level of this value.
     */
    dataLevel: Level;

    /**
     * Returns a string representation of the value.
     *
     * @param omitLevels Whether the security level(s) should be omitted in the
     *                   generated string.
     *
     * @param taintRef   A `TaintRef` object to be updated with the information
     *                   level associated with the `string` result.
     */
    stringRep (omitLevels?: boolean, taintRef?: TaintRef): string;
}

/**
 * Base type for Troupe runtime values that aggregate other values, e.g., `List`.
 */
export interface TroupeAggregate extends TroupeValue {
}

/**
 * Base type for Troupe runtime functions, i.e., closures.
 */
export interface TroupeFunction extends TroupeValue {
    /**
     * Access to the function body.
     */
    fun: (x?: any) => any;

    /**
     * Execution of the function.
     */
    (x?: any): any;

    /**
     * The type of closure.
     */
    _closureType: ClosureType;
}
