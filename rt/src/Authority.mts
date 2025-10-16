import { Level, BOT } from "./Level.mjs";

import { TroupeRawValue } from "./TroupeRawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";

export class Authority implements TroupeRawValue {
    authorityLevel: Level;
    stringRep: () => string;
    _troupeType = TroupeType.AUTHORITY;
    dataLevel = BOT;
    constructor (authorityLevel: Level) {
        this.authorityLevel = authorityLevel;
        this.stringRep = this.toString;
    }

    toString () {
        const x = this.authorityLevel.stringRep();
        return "!" + x;
    }
}

