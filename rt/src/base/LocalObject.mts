import {TroupeType} from './TroupeTypes.mjs'
import {TroupeValue} from './TroupeValue.mjs'
import * as levels from '../Level.mjs'

export class LocalObject implements TroupeValue {
    _troupeType : TroupeType
    _value : Object
    dataLevel = levels.ROOT// 2025-05-25; AA; consider rethinking what this should be...

    constructor (v:Object) {
        this._troupeType = TroupeType.LocalObject
        this._value = v
    }

    stringRep (omitLevels?: boolean, taintRef?: any):string { 
        return "LocalObject"
    }
}