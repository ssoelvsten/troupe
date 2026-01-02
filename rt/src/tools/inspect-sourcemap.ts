#!/usr/bin/env npx ts-node
/**
 * Inspect a Troupe source map file
 * Usage: npx ts-node rt/src/tools/inspect-sourcemap.ts [--one-based] <file.js.map>
 *
 * Options:
 *   --one-based  Display line/column numbers as 1-based (matching editor display)
 *                Default is 0-based (matching source map spec)
 */

import { readFileSync } from 'fs';
import { SourceMapConsumer, RawSourceMap } from 'source-map';

interface MappingInfo {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number | null;
  originalColumn: number | null;
  source: string | null;
  name: string | null;
}

function parseArgs(): { mapFile: string; oneBased: boolean } {
  const args = process.argv.slice(2);
  let oneBased = false;
  let mapFile: string | undefined;

  for (const arg of args) {
    if (arg === '--one-based' || arg === '-1') {
      oneBased = true;
    } else if (!arg.startsWith('-')) {
      mapFile = arg;
    }
  }

  if (!mapFile) {
    console.error('Usage: npx ts-node rt/src/tools/inspect-sourcemap.ts [--one-based] <file.js.map>');
    console.error('');
    console.error('Options:');
    console.error('  --one-based, -1  Display as 1-based (editor line numbers)');
    console.error('                   Default is 0-based (source map spec)');
    process.exit(1);
  }

  return { mapFile, oneBased };
}

async function main(): Promise<void> {
  const { mapFile, oneBased } = parseArgs();
  // source-map library returns: lines as 1-based, columns as 0-based
  // With --one-based, we convert columns to 1-based too (matching editors)
  const colOffset = oneBased ? 1 : 0;
  const indexing = oneBased ? '1-based (editor)' : '0-based columns (spec)';

  const map: RawSourceMap = JSON.parse(readFileSync(mapFile, 'utf8'));

  console.log('=== Source Map Info ===');
  console.log('File:', map.file);
  console.log('Sources:', map.sources);
  console.log('Version:', map.version);
  console.log('Mappings length:', map.mappings?.length ?? 0, 'chars');
  console.log('Display mode:', indexing);
  console.log('');

  const consumer = await new SourceMapConsumer(map);

  const mappings: MappingInfo[] = [];
  consumer.eachMapping((m: MappingInfo) => {
    mappings.push(m);
  });

  console.log('=== Decoded Mappings ===');
  console.log('Total mappings:', mappings.length);
  console.log('');

  if (mappings.length === 0) {
    console.log('(no mappings)');
  } else {
    // Group by source file
    const bySource: Record<string, MappingInfo[]> = {};
    for (const m of mappings) {
      const src = m.source || '(no source)';
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(m);
    }

    for (const [source, maps] of Object.entries(bySource)) {
      console.log(`Source: ${source}`);
      console.log('-'.repeat(60));
      for (const m of maps) {
        // Lines are already 1-based from the library, only adjust columns
        const genCol = (m.generatedColumn + colOffset).toString().padStart(3);
        const origCol = m.originalColumn !== null ? m.originalColumn + colOffset : null;
        console.log(
          `  Gen L${m.generatedLine}:${genCol} -> ` +
          `Orig L${m.originalLine}:${origCol}`
        );
      }
      console.log('');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
