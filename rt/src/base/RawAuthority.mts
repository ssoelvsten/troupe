import { Level, BOT } from "../Level.mjs";

import { TroupeValue } from "./TroupeValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";

export class RawAuthority implements TroupeValue {
    _troupeType: TroupeType.Authority = TroupeType.Authority;
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

