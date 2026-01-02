# Phase 13: Runtime Source Map Resolver

**Status**: Pending

**Goal**: Runtime resolves source positions and includes them in error messages.

---

## Phase 13a: Add dependency to rt/package.json

```json
{
  "dependencies": {
    "source-map": "^0.7.4"
  }
}
```

---

## Phase 13b: Create SourceMapResolver.mts (NEW FILE)

**File**: `rt/src/SourceMapResolver.mts`

```typescript
import { SourceMapConsumer } from 'source-map';
import * as fs from 'fs';
import * as path from 'path';

// Cache for loaded source map consumers
const consumers = new Map<string, SourceMapConsumer>();

/**
 * Get or create a SourceMapConsumer for a JS file
 */
async function getConsumer(jsFile: string): Promise<SourceMapConsumer | null> {
    if (consumers.has(jsFile)) {
        return consumers.get(jsFile)!;
    }

    const mapFile = jsFile + '.map';
    try {
        if (!fs.existsSync(mapFile)) {
            return null;
        }
        const rawMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
        const consumer = await new SourceMapConsumer(rawMap);
        consumers.set(jsFile, consumer);
        return consumer;
    } catch {
        return null;
    }
}

/**
 * Resolve a generated JS position to original source position
 */
export async function resolvePosition(
    jsFile: string,
    line: number,
    column: number
): Promise<string | null> {
    const consumer = await getConsumer(jsFile);
    if (!consumer) {
        return null;
    }

    const orig = consumer.originalPositionFor({ line, column });
    if (orig.source && orig.line) {
        return `${orig.source}:${orig.line}:${orig.column ?? 0}`;
    }
    return null;
}

/**
 * Find user code location by parsing current stack trace
 */
export async function findUserCodeLocation(compiledJsPath: string): Promise<string | null> {
    const err = new Error();
    const stack = err.stack || '';

    const frameRegex = /at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?/g;

    let match;
    while ((match = frameRegex.exec(stack)) !== null) {
        const [, file, line, col] = match;

        if (file.endsWith('.js') && !file.includes('node_modules') && !file.includes('rt/built')) {
            const resolved = await resolvePosition(
                file.replace('file://', ''),
                parseInt(line),
                parseInt(col)
            );
            if (resolved) {
                return resolved;
            }
        }
    }
    return null;
}

/**
 * Cleanup consumers when done
 */
export function destroyConsumers(): void {
    for (const consumer of consumers.values()) {
        consumer.destroy();
    }
    consumers.clear();
}
```

---

## Phase 13c: Integrate resolver into Thread.mts

**File**: `rt/src/Thread.mts`

```typescript
import { findUserCodeLocation } from './SourceMapResolver.mjs';

class Thread {
    private compiledJsPath: string = '';

    setCompiledPath(path: string): void {
        this.compiledJsPath = path;
    }

    async threadError(message: string): Promise<never> {
        let fullMessage = message;

        if (this.compiledJsPath) {
            try {
                const loc = await findUserCodeLocation(this.compiledJsPath);
                if (loc) {
                    fullMessage += `\n | at ${loc}`;
                }
            } catch {
                // Source map resolution failed
            }
        }

        console.error(`Error: ${fullMessage}`);
        throw new TroupeError(fullMessage);
    }
}
```

---

## Phase 13d: Initialize resolver

**File**: `rt/src/TroupeRuntimeInit.mts` (or appropriate init file)

```typescript
import { destroyConsumers } from './SourceMapResolver.mjs';

// During initialization:
thread.setCompiledPath(compiledJsFile);

// On process exit:
process.on('exit', () => {
    destroyConsumers();
});
```

---

## Test

After completing this phase:
```bash
make rt
```

Run a program that triggers an IFC error or type error. Verify source location appears in the error message.

---

## Files Modified

| File | Changes |
|------|---------|
| `rt/package.json` | Add `source-map` dependency |
| `rt/src/SourceMapResolver.mts` | **NEW** - resolve positions |
| `rt/src/Thread.mts` | Integrate resolver |
| `rt/src/TroupeRuntimeInit.mts` | Initialize resolver |

---

## Next Phase

After completing this phase, proceed to [Phase 14: Error Message Positions](phase-14-position-params.md).
