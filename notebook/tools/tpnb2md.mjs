#!/usr/bin/env node

// tpnb2md.mjs — Convert Troupe notebook (.tpnb) to markdown
//
// Usage: node tpnb2md.mjs <input.tpnb> [output.md]
//
// If output is omitted, derives from input filename.
// If output is "-", writes to stdout.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, dirname, join } from 'node:path';

function usage() {
  console.error('Usage: node tpnb2md.mjs <input.tpnb> [output.md]');
  process.exit(1);
}

function convert(notebook) {
  const cells = notebook.cells || [];
  const sections = [];

  for (const cell of cells) {
    if (cell.type === 'markdown') {
      sections.push(cell.source);
    } else if (cell.type === 'code') {
      const isFragment = cell.fragment || cell.preamble;
      const name = cell.fragmentName || cell.preambleName || '';

      // Fragment annotation as an HTML comment
      if (isFragment && name) {
        sections.push(`<!-- fragment: ${name} -->`);
      } else if (isFragment) {
        sections.push(`<!-- fragment -->`);
      }

      sections.push('```troupe\n' + cell.source + '\n```');

      // Include outputs if present
      const outputs = cell.outputs || [];
      const outputLines = [];
      for (const out of outputs) {
        if (out.type === 'stdout' && out.data.trim()) {
          outputLines.push(out.data.trimEnd());
        } else if (out.type === 'result' && out.data.trim()) {
          outputLines.push(out.data.trimEnd());
        } else if (out.type === 'stderr' && out.data.trim()) {
          outputLines.push('[stderr] ' + out.data.trimEnd());
        } else if (out.type === 'compile_error' && out.data.trim()) {
          outputLines.push('[compile error] ' + out.data.trimEnd());
        }
      }
      if (outputLines.length > 0) {
        sections.push('```text\n' + outputLines.join('\n') + '\n```');
      }
    }
  }

  return sections.join('\n\n') + '\n';
}

// --- Main ---

const args = process.argv.slice(2);
if (args.length < 1) usage();

const inputPath = args[0];
const raw = readFileSync(inputPath, 'utf-8');
const notebook = JSON.parse(raw);

if (!notebook.troupe_notebook || !notebook.cells) {
  console.error('Error: not a valid .tpnb file (missing troupe_notebook or cells)');
  process.exit(1);
}

const md = convert(notebook);

if (args.length >= 2 && args[1] === '-') {
  process.stdout.write(md);
} else {
  const outputPath = args[1] ||
    join(dirname(inputPath), basename(inputPath, extname(inputPath)) + '.md');
  writeFileSync(outputPath, md);
  const cellCount = notebook.cells.length;
  console.error(`Exported ${cellCount} cells to ${outputPath}`);
}
