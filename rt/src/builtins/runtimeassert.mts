import { rawAssertIsFunction, rawAssertIsBoolean, rawAssertIsList, rawAssertIsNumber, rawAssertIsRecord, rawAssertIsString, rawAssertIsTuple, rawAssertPairsAreStringsOrNumbers, rawAssertIsLevel, rawAssertTupleLengthGreaterThan, rawAssertRecordHasField, AssertionSource } from '../Asserts.mjs'
import {UserRuntimeZero, Constructor } from './UserRuntimeZero.mjs'

const S = AssertionSource.AssertInUserCode;

export function RuntimeAssert <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {

        rawAssertIsNumber = (x) => rawAssertIsNumber(x, S)
        rawAssertIsBoolean = (x) => rawAssertIsBoolean(x, S)
        rawAssertIsString = (x) => rawAssertIsString(x, S)
        rawAssertIsList = (x) => rawAssertIsList(x, S)
        rawAssertIsFunction = (x, internal = false) => rawAssertIsFunction(x, internal, S)
        rawAssertIsRecord = (x) => rawAssertIsRecord(x, S)
        rawAssertIsTuple = (x) => rawAssertIsTuple(x, S)
        rawAssertTupleLengthGreaterThan = (x, n) => rawAssertTupleLengthGreaterThan(x, n, S)
        rawAssertRecordHasField = (x, field) => rawAssertRecordHasField(x, field, S)
        rawAssertPairsAreStringsOrNumbers = (x, y) => rawAssertPairsAreStringsOrNumbers(x, y, S)
        rawAssertIsLevel = (x) => rawAssertIsLevel(x, S)
    }
}
