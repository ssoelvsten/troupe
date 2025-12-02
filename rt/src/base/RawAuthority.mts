import { Level, BOT } from "../Level.mjs";

import { RawValue } from "./RawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";

export class RawAuthority implements RawValue {
    _troupeType: TroupeType.AUTHORITY = TroupeType.AUTHORITY;
    authorityLevel: Level;
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

