import {TroupeType} from './TroupeTypes.mjs'
import {RawValue} from './RawValue.mjs'
import * as levels from '../Level.mjs'

export class LocalObject implements RawValue {
    _troupeType : TroupeType
    _value : Object
    dataLevel = levels.ROOT// 2025-05-25; AA; consider rethinking what this should be...

    constructor (v:Object) {
        this._troupeType = TroupeType.LOCALOBJECT
        this._value = v
    }

    stringRep (omitLevels?: boolean, taintRef?: any):string { 
        return "LocalObject"
    }
}