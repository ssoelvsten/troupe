import { LVal } from "./base/LVal.mjs"
import { BOT, Level, ROOT, TOP } from "./Level.mjs";
import { RawClosure } from './base/RawClosure.mjs';
import { Scheduler, ThreadType } from "./Scheduler.mjs";
import { RawList } from "./base/RawList.mjs";
import { readFile } from "fs/promises";
import { mkAuthority, mkTuple } from "./base/rawUtil.mjs";
import { DCLabel } from "./levels/DCLabels/dclabel.mjs";
import { CNF_FALSE } from "./levels/DCLabels/cnf.mjs";
import { LocalObject } from "./base/LocalObject.mjs";

const __sendCache = {};
const __recvCache = {};

let __scheduler: Scheduler;

async function initP2PCache(userRuntime: any, scheduler: Scheduler, cache: any): Promise<void> {
    __scheduler = scheduler;

    // Load file and initialise its functions
    const input = await import(`${process.env.TROUPE}/trp-rt/out/P2PCache.js`);
    const C: any = input.default;
    const code = new C(userRuntime);

    await userRuntime.linkLibs(code);

    // Run the code until the end, where it exports a table.
    const ltable: LVal<RawList> = await new Promise((resolve, reject) => {
        const cacheAuthority = new LVal(mkAuthority(ROOT), BOT);

        scheduler.scheduleNewThread(
            () => code.main({ __dataLevel:BOT })
            , cacheAuthority
            , BOT
            , BOT
            , ThreadType.Other
            , resolve
        );
        scheduler.resumeLoopAsync();
    });

    const table: LVal<any>[] = ltable.val.toArray();

    // Populate `cache` with the exported functions
    for (let i = 0; i < table.length; i++) {
        const name: string = table[i].val[0].val;
        const ff: LVal<RawClosure> = table[i].val[1].val;
        cache[name] = ff;
    }
}

export function initP2PCaches(userRuntime: any, scheduler: Scheduler) {
    return Promise.all([ initP2PCache(userRuntime, scheduler, __sendCache)
                       , initP2PCache(userRuntime, scheduler, __recvCache)
                       ]);
}

/**
 * UNSAFE HACK!!!
 *
 * There is an ergonomics issue with the `declassify`/`endorse` in Troupe. You
 * have to do one dimension at a time, meaning you have to write out the other.
 *
 * Yet, in the general case you cannot do that since you don't know the labels
 * that are involved. So, we'll ignore the integrity dimension.
 *
 * The only saving grace to do so is that we have already checked whether the
 * SHA256 sum matches.
 */
function endorseKey<T>(hash: LVal<T>): LVal<T> {
    return LVal.copyUnsafe(hash,
                           new DCLabel(hash.lev.confidentiality, CNF_FALSE),
                           new DCLabel(hash.tlev.confidentiality, CNF_FALSE)
    );
}

/**
 * Cache to hold onto values sent to other peers.
 *
 * @todo Work out the information flows needed; regardless of whether we rely
 *       on the Troupe runtime, it is worth understanding what should happen.
 *       Furthermore, this way we can be sure to know what Troupe can do and
 *       what we have to do here in the TCB.
 */
class P2PCache<T> {
    private troupeFns;

    constructor (troupeFns) {
        this.troupeFns = troupeFns;
    }

    /**
     * Insert the given key-value pair into the cache.
     */
    async set(key: LVal<string>, value: T)
        : Promise<void>
    {
        await new Promise((resolve, reject) => {
            const arg0 = endorseKey(key);
            const arg1 = new LVal(new LocalObject(value));

            __scheduler.scheduleNewThread(
                () => this.troupeFns['set']
                , new LVal(mkTuple([arg0, arg1]))
                , BOT
                , BOT
                , ThreadType.Other
                , resolve
            );
            __scheduler.resumeLoopAsync();
        });
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
    async get(key: LVal<string>, accessLevel: Level = BOT)
        : Promise<undefined | T>
    {
        const findRes: LVal<RawList> = await new Promise((resolve, reject) => {
            const arg0 = endorseKey(key);
            const arg1 = new LVal(accessLevel);

            __scheduler.scheduleNewThread(
                () => this.troupeFns['get']
                , new LVal(mkTuple([arg0, arg1]))
                , BOT
                , BOT
                , ThreadType.Other
                , resolve
            );
            __scheduler.resumeLoopAsync();
        });

        // NOTE: `HashMap.findAll` returns `[...values]` that are accessible
        //       with the given key.
        const isNone = findRes.val.isNil;
        if (isNone) {
            return undefined;
        }

        // Pick the latest value
        const head: LVal<LocalObject> = findRes.val.head;
        return head.val._value as T;
    }
}

export const sendCache = new P2PCache<any /* SerializedValue */>(__sendCache);
export const recvCache = new P2PCache<any /* SerializedValue */>(__recvCache);

// TODO: moduleCache
