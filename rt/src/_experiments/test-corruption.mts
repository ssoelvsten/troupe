#!/usr/bin/env node

import { DCLabel, IFC_BOT, IFC_TOP, TRUST_NULL, TRUST_ROOT, levels } from '../levels/DCLabels/dclabel.mjs';
import { implies, CNF_TRUE, CNF_FALSE, Category, CNF } from '../levels/DCLabels/cnf.mjs';
import { DowngradeResult, DowngradeErrorReason } from '../DowngradeEnums.mjs';

// Helper to format downgrade results
const reasonNames: Record<DowngradeErrorReason, string> = {
    [DowngradeErrorReason.INTEGRITY_MISMATCH]: "INTEGRITY_MISMATCH",
    [DowngradeErrorReason.CONFIDENTIALITY_MISMATCH]: "CONFIDENTIALITY_MISMATCH",
    [DowngradeErrorReason.INSUFFICIENT_AUTHORITY]: "INSUFFICIENT_AUTHORITY",
    [DowngradeErrorReason.BLOCKING_LEVEL_MISMATCH]: "BLOCKING_LEVEL_MISMATCH",
    [DowngradeErrorReason.ROBUSTNESS_VIOLATION]: "ROBUSTNESS_VIOLATION",
    [DowngradeErrorReason.TRANSPARENCY_VIOLATION]: "TRANSPARENCY_VIOLATION",
};

function formatResult(r: DowngradeResult): string {
    if (r.kind === "SUCCESS") return "SUCCESS";
    return `FAILURE: ${reasonNames[r.reason]}`;
}

// Helper to create labels from tags
function mkLabel(cTags: string[], iTags: string[]): DCLabel {
    const mkCNF = (tags: string[]): CNF => {
        if (tags.length === 0) return CNF_TRUE;
        const cats = new Set(tags.map(t => new Category(new Set([t]))));
        return new CNF(cats);
    };
    return new DCLabel(mkCNF(cTags), mkCNF(iTags));
}

// Common labels
const alice = DCLabel.fromSingleTag('alice');
const bob = DCLabel.fromSingleTag('bob');
const t = DCLabel.fromSingleTag('t');

console.log("DC Label Corruption Experiments");
console.log("=".repeat(60));

// Basic label info
console.log("\nBasic labels:");
console.log(`  alice = ${alice.stringRep()}`);
console.log(`  bob   = ${bob.stringRep()}`);
console.log(`  t     = ${t.stringRep()}`);
console.log(`  IFC_BOT    = ${IFC_BOT.stringRep()}  (public, high integrity)`);
console.log(`  IFC_TOP    = ${IFC_TOP.stringRep()}  (secret, low integrity)`);
console.log(`  TRUST_NULL = ${TRUST_NULL.stringRep()}  (public, low integrity)`);
console.log(`  TRUST_ROOT = ${TRUST_ROOT.stringRep()}  (secret, high integrity)`);

// Join creates corruption
console.log("\n" + "-".repeat(60));
console.log("Join of symmetric labels creates corruption:");
const aliceJoinBob = alice.join(bob);
console.log(`  alice join bob = ${aliceJoinBob.stringRep()}`);
console.log(`  Corrupt? ${aliceJoinBob.isCorrupt()}`);
console.log(`  Reflection: ${aliceJoinBob.reflection().stringRep()}`);

// Your experiments below...
console.log("\n" + "=".repeat(60));
console.log("Your experiments here...");
console.log("=".repeat(60));

