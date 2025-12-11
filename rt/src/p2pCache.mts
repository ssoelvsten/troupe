import { LVal } from "./base/LVal.mjs"
import { BOT, Level } from "./Level.mjs";

/**
 * Cache to hold onto values sent to other peers.
 *
 * @todo Replace with the `HashMap` module in Troupe.
 *
 * @todo Include the access level as part of the `has` and `get` to include the
 *       levels checking inside of the Troupe implementation.
 *
 * @todo Work out the information flows needed; regardless of whether we rely
 *       on the Troupe runtime, it is worth understanding what should happen.
 *       Furthermore, this way we can be sure to know what Troupe can do and
 *       what we have to do here in the TCB.
 */
class P2PCache {
    private debug = "";
    private cache = {};

    constructor (debugName) {
        this.debug = debugName;
    }

    /**
     * Insert the given key-value pair into the cache.
     *
     * @todo How to deal with insertions of the same value at different levels?
     *       In some cases, it implies a declassification. In others we need to
     *       store it for each level independently.
     */
    async set(key: LVal<string>, value: LVal<any>): Promise<void> {
        console.log(`${this.debug}Cache::set(${key.val}, ...: ${value._troupeType})`);
        // HACK: The `key.val` is a little hack until we get the Troupe `HashMap`
        //       rolling.
        //
        // TODO: Place `(key, value)` on a Thread?
        this.cache[key.val] = value;
    }

    /**
     * Obtain the value associated with said key.
     *
     * @details returns a default `None` value if the value does not exist or
     *          if the `accessLevel` is not sufficient.
     *
     * @returns the value with its level raised to also encompass the level of
     *          the key. If not available at the given level, then `None` is
     *          returned.
     */
    async get(key: LVal<string>, accessLevel: Level = BOT): Promise<LVal<undefined>> {
        console.log(`${this.debug}Cache::get(${key.val}, ${accessLevel.stringRep()})`);
        // TODO: Place `(key, accessLevel)` on a Thread?
        return this.cache[key.val];
    }
}

export const sendCache = new P2PCache("Sender");
export const recvCache = new P2PCache("Receive");

// TODO: moduleCache
