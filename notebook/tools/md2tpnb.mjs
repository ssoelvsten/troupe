#!/usr/bin/env node

// md2tpnb.mjs — Convert MyST markdown (Jupyter Book) to Troupe notebook (.tpnb)
//
// Usage: node md2tpnb.mjs <input.md> [output.tpnb]
//
// If output is omitted, derives from input filename.
// If output is "-", writes to stdout.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

function usage() {
  console.error('Usage: node md2tpnb.mjs <input.md> [output.tpnb]');
  process.exit(1);
}

function genId(index) {
  const rand = randomBytes(3).toString('hex');
  return `cell-${index}-${rand}`;
}

// Detect if a ```text block is shell commands (has $ prompts) vs expected output
function isShellBlock(lines) {
  return lines.some(l => /^\s*\$\s/.test(l));
}

// Strip leading filename comment like (* basic_fib.trp *)
function stripFilenameComment(source) {
  const lines = source.split('\n');
  if (lines.length > 0 && /^\s*\(\*\s*\S+\.(trp|picox|pico|femto|atto)\s*\*\)\s*$/.test(lines[0])) {
    const rest = lines.slice(1).join('\n');
    // Also strip leading blank line after the comment
    return rest.replace(/^\n/, '');
  }
  return source;
}

function convert(mdContent) {
  const lines = mdContent.split('\n');
  const cells = [];
  let cellIndex = 1;

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];
  let proseLines = [];
  let hasRecentCodeCell = false; // true after a code cell; stays true through prose, cleared on output block

  function flushProse() {
    const text = proseLines.join('\n').trim();
    proseLines = [];
    if (text) {
      cells.push({
        id: genId(cellIndex++),
        type: 'markdown',
        source: text,
      });
      // Don't reset hasRecentCodeCell — prose between code and output is normal
    }
  }

  function flushCodeBlock() {
    const content = codeBlockLines.join('\n');
    const lang = codeBlockLang.toLowerCase();
    codeBlockLines = [];
    codeBlockLang = '';

    if (lang === 'troupe' || lang === 'sml') {
      // Executable Troupe code cell
      const source = stripFilenameComment(content).trim();
      if (source) {
        cells.push({
          id: genId(cellIndex++),
          type: 'code',
          source,
        });
        hasRecentCodeCell = true;
      }
    } else if (lang === 'text') {
      if (isShellBlock(content.split('\n'))) {
        // Shell commands — keep as markdown fenced code
        cells.push({
          id: genId(cellIndex++),
          type: 'markdown',
          source: '```\n' + content + '\n```',
        });
        hasRecentCodeCell = false;
      } else if (hasRecentCodeCell) {
        // Expected output after a code cell
        cells.push({
          id: genId(cellIndex++),
          type: 'markdown',
          source: '**Expected output:**\n```\n' + content.trim() + '\n```',
        });
        hasRecentCodeCell = false;
      } else {
        // Generic text block
        cells.push({
          id: genId(cellIndex++),
          type: 'markdown',
          source: '```\n' + content + '\n```',
        });
        hasRecentCodeCell = false;
      }
    } else {
      // Other language tags — keep as markdown fenced code
      const fence = lang ? '```' + lang : '```';
      cells.push({
        id: genId(cellIndex++),
        type: 'markdown',
        source: fence + '\n' + content + '\n```',
      });
      hasRecentCodeCell = false;
    }
  }

  for (const line of lines) {
    if (!inCodeBlock) {
      const fenceMatch = line.match(/^```(\w*)$/);
      if (fenceMatch) {
        flushProse();
        inCodeBlock = true;
        codeBlockLang = fenceMatch[1] || '';
        codeBlockLines = [];
      } else {
        proseLines.push(line);
      }
    } else {
      if (line === '```') {
        inCodeBlock = false;
        flushCodeBlock();
      } else {
        codeBlockLines.push(line);
      }
    }
  }

  // Flush any remaining prose
  flushProse();

  return {
    troupe_notebook: 1,
    options: {
      nmifc: true,
      labelFormat: 'v1',
      timeout: 10,
    },
    cells,
  };
}

// --- Main ---

const args = process.argv.slice(2);
if (args.length < 1) usage();

const inputPath = args[0];
const mdContent = readFileSync(inputPath, 'utf-8');
const notebook = convert(mdContent);
const json = JSON.stringify(notebook, null, 2) + '\n';

if (args.length >= 2 && args[1] === '-') {
  process.stdout.write(json);
} else {
  const outputPath = args[1] ||
    join(dirname(inputPath), basename(inputPath, extname(inputPath)) + '.tpnb');
  writeFileSync(outputPath, json);
  console.error(`Wrote ${notebook.cells.length} cells to ${outputPath}`);
}
