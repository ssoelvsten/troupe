#!/usr/bin/env npx ts-node
/**
 * Inspect a Troupe source map file
 * Usage: npx ts-node rt/src/tools/inspect-sourcemap.ts <file.js.map>
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

async function main(): Promise<void> {
  const mapFile = process.argv[2];
  if (!mapFile) {
    console.error('Usage: npx ts-node rt/src/tools/inspect-sourcemap.ts <file.js.map>');
    process.exit(1);
  }

  const map: RawSourceMap = JSON.parse(readFileSync(mapFile, 'utf8'));

  console.log('=== Source Map Info ===');
  console.log('File:', map.file);
  console.log('Sources:', map.sources);
  console.log('Version:', map.version);
  console.log('Mappings length:', map.mappings?.length ?? 0, 'chars');
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
        const genCol = m.generatedColumn.toString().padStart(3);
        console.log(
          `  Gen L${m.generatedLine}:${genCol} -> ` +
          `Orig L${m.originalLine}:${m.originalColumn}`
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
