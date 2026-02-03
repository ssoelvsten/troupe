import { Authority } from './Authority.mjs';
import { LVal } from './Lval.mjs';
import { Level } from './Level.mjs';
import { IngressResult, DeserializeResult } from './deserialize.mjs';

/**
 * Wrap a quarantine level in Authority and LVal for message metadata.
 * Returns null if auth is null.
 */
export function wrapQuarantineAuth(auth: Level | null, level: Level): LVal | null {
    if (auth === null) return null;
    return new LVal(new Authority(auth), level);
}

/**
 * Extract quarantine authority from deserialize result.
 * Returns null if result is TRUSTED.
 */
export function extractQuarantineAuth(result: DeserializeResult): Level | null {
    return result.result === IngressResult.QUARANTINE
        ? result.quarantineAuth!
        : null;
}

/**
 * Check if result should be dropped (corrupt data).
 */
export function shouldDrop(result: DeserializeResult): boolean {
    return result.result === IngressResult.DROP;
}
