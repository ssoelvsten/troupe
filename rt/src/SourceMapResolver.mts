/**
 * SourceMapResolver.mts - Runtime source map translation
 *
 * Uses @jridgewell/trace-mapping (already a transitive dependency)
 * for synchronous source map lookups.
 */

import { TraceMap, originalPositionFor, type EncodedSourceMap } from '@jridgewell/trace-mapping';

// Re-export the type for use by other modules
export type { EncodedSourceMap };

/**
 * Look up original position. Returns null if not found.
 * Lines are 1-based, columns are 0-based (source map convention).
 */
export function lookupPosition(
    sourceMap: EncodedSourceMap,
    jsLine: number,
    jsColumn: number
): { source: string; line: number; column: number } | null {
    const tracer = new TraceMap(sourceMap);
    const pos = originalPositionFor(tracer, { line: jsLine, column: jsColumn });
    if (pos.source && pos.line !== null) {
        return { source: pos.source, line: pos.line, column: pos.column ?? 0 };
    }
    return null;
}
