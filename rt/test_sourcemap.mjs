import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { readFileSync } from 'fs';

const content = readFileSync('/tmp/test_fib_debug.js', 'utf-8');
const match = content.match(/sourceMappingURL=data:application\/json;charset=utf-8;base64,(.+)/);
const sourceMap = JSON.parse(Buffer.from(match[1], 'base64').toString());

const tracer = new TraceMap(sourceMap);

for (let line = 330; line <= 340; line++) {
    for (let col = 0; col <= 20; col += 4) {
        const pos = originalPositionFor(tracer, { line, column: col });
        if (pos.source && pos.line !== null) {
            console.log(`JS ${line}:${col} -> ${pos.source}:${pos.line}:${pos.column}`);
        }
    }
}
