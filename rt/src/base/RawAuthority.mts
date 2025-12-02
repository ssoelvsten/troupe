import { Level, BOT } from "../Level.mjs";

import { TroupeRawValue } from "./TroupeRawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";

export class RawAuthority implements TroupeRawValue {
    authorityLevel: Level;
    _troupeType = TroupeType.AUTHORITY;
    dataLevel = BOT;

    constructor (authorityLevel: Level) {
        this.authorityLevel = authorityLevel;
    }

    toString () {
        let x = this.authorityLevel.stringRep();
        return "!" + x;
    }

    stringRep() {
        return this.toString();
    }
}

