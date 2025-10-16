import {TroupeType} from './TroupeTypes.mjs';
import {TroupeRawValue} from './TroupeRawValue.mjs';
import * as levels from './Level.mjs';

export class LocalObject implements TroupeRawValue {
    _troupeType : TroupeType;
    _value : object;
    dataLevel = levels.ROOT;// 2025-05-25; AA; consider rethinking what this should be...

    constructor (v:object) {
        this._troupeType = TroupeType.LOCALOBJECT;
        this._value = v;
    }

    stringRep (omitLevels?: boolean, taintRef?: any):string {
        return "LocalObject";
    }
}