#!/usr/bin/env node

import { DCLabel, IFC_BOT, IFC_TOP, TRUST_NULL, TRUST_ROOT, levels } from '../levels/DCLabels/dclabel.mjs';
import { implies, CNF_TRUE, CNF_FALSE } from '../levels/DCLabels/cnf.mjs';
import { DowngradeResult, DowngradeErrorReason } from '../DowngradeEnums.mjs';

const reasonNames: Record<DowngradeErrorReason, string> = {
    [DowngradeErrorReason.INTEGRITY_MISMATCH]: "INTEGRITY_MISMATCH",
    [DowngradeErrorReason.CONFIDENTIALITY_MISMATCH]: "CONFIDENTIALITY_MISMATCH",
    [DowngradeErrorReason.INSUFFICIENT_AUTHORITY]: "INSUFFICIENT_AUTHORITY",
    [DowngradeErrorReason.BLOCKING_LEVEL_MISMATCH]: "BLOCKING_LEVEL_MISMATCH",
    [DowngradeErrorReason.ROBUSTNESS_VIOLATION]: "ROBUSTNESS_VIOLATION",
    [DowngradeErrorReason.TRANSPARENCY_VIOLATION]: "TRANSPARENCY_VIOLATION",
};

console.log("Testing DCLabel reflection and corruption detection\n");
console.log("=".repeat(60));

function testLabel(name: string, label: DCLabel) {
    const reflection = label.reflection();
    const isCorrupt = label.isCorrupt();

    console.log(`\n${name}:`);
    console.log(`  Label:      ${label.stringRep()}`);
    console.log(`  Reflection: ${reflection.stringRep()}`);
    console.log(`  Corrupt:    ${isCorrupt}`);

    if (isCorrupt) {
        // Explain why it's corrupt
        const cReflImpliesC = implies(reflection.confidentiality, label.confidentiality);
        const iImpliesIRefl = implies(label.integrity, reflection.integrity);
        console.log(`  Why corrupt:`);
        console.log(`    C_refl => C_orig: ${cReflImpliesC}`);
        console.log(`    I_orig => I_refl: ${iImpliesIRefl}`);
    }
}

// Test 1: Core labels
console.log("\n1. Core labels:");
console.log("-".repeat(40));

testLabel("IFC_BOT  <True; False>", IFC_BOT);
testLabel("IFC_TOP  <False; True>", IFC_TOP);
testLabel("TRUST_NULL <True; True>", TRUST_NULL);
testLabel("TRUST_ROOT <False; False>", TRUST_ROOT);

// Test 2: Single tag label
console.log("\n\n2. Single tag 'alice':");
console.log("-".repeat(40));

const alice = DCLabel.fromSingleTag('alice');
testLabel("alice", alice);

// Test 3: Join of alice and bob
console.log("\n\n3. Join of 'alice' and 'bob':");
console.log("-".repeat(40));

const bob = DCLabel.fromSingleTag('bob');
const aliceJoinBob = alice.join(bob);
testLabel("alice ⊔ bob", aliceJoinBob);

// Test 4: Downgrade checks on corrupt labels
console.log("\n\n4. Downgrade checks on corrupt label with ROOT authority:");
console.log("-".repeat(40));

function formatResult(r: DowngradeResult): string {
    if (r.kind === "SUCCESS") return "SUCCESS";
    return `FAILURE: ${reasonNames[r.reason]}`;
}

// Try to declassify {alice,bob} to {} using ROOT authority
console.log("\nDeclassify {alice,bob} → {} with ROOT authority:");
const declassResult = levels.okToDeclassify(
    aliceJoinBob,  // from
    IFC_BOT,       // to (bottom = public)
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    false          // isNMIFC
);
console.log(`  From:      ${aliceJoinBob.stringRep()}`);
console.log(`  To:        ${IFC_BOT.stringRep()}`);
console.log(`  Authority: ${TRUST_ROOT.stringRep()}`);
console.log(`  Result:    ${formatResult(declassResult)}`);

// Try to endorse {alice,bob} to ROOT using ROOT authority
console.log("\nEndorse {alice,bob} → {#ROOT} with ROOT authority:");
const endorseResult = levels.okToEndorse(
    aliceJoinBob,  // from
    TRUST_ROOT,    // to (root = fully trusted)
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    false          // isNMIFC
);
console.log(`  From:      ${aliceJoinBob.stringRep()}`);
console.log(`  To:        ${TRUST_ROOT.stringRep()}`);
console.log(`  Authority: ${TRUST_ROOT.stringRep()}`);
console.log(`  Result:    ${formatResult(endorseResult)}`);

// Test 5: A downgrade that SUCCEEDS under current rules but involves corrupt labels
console.log("\n\n5. Downgrade that succeeds (current rules) but involves corrupt label:");
console.log("-".repeat(40));

// {alice,bob} has C = alice ∧ bob, I = alice ∨ bob
// To declassify, we need a target with SAME integrity (alice ∨ bob)
// Let's declassify C from (alice ∧ bob) to True (public confidentiality)

// Create target: <True; alice ∨ bob> - public confidentiality, same integrity
const targetForDecl = new DCLabel(CNF_TRUE, aliceJoinBob.integrity);

console.log("\nDeclassify {alice,bob} → <True; alice|bob> with ROOT authority:");
const declassResult2 = levels.okToDeclassify(
    aliceJoinBob,    // from: <alice ∧ bob; alice ∨ bob>
    targetForDecl,   // to:   <True; alice ∨ bob>
    TRUST_ROOT,      // authority
    IFC_BOT,         // blocking level
    false            // isNMIFC
);
console.log(`  From:      ${aliceJoinBob.stringRep()} (corrupt: ${aliceJoinBob.isCorrupt()})`);
console.log(`  To:        ${targetForDecl.stringRep()} (corrupt: ${targetForDecl.isCorrupt()})`);
console.log(`  Authority: ${TRUST_ROOT.stringRep()}`);
console.log(`  Result:    ${formatResult(declassResult2)}`);

// Similarly for endorsement: keep C same, change I
// Create target: <alice ∧ bob; False> - same confidentiality, bottom integrity
const targetForEndorse = new DCLabel(aliceJoinBob.confidentiality, CNF_FALSE);

console.log("\nEndorse {alice,bob} → <alice&bob; False> with ROOT authority:");
const endorseResult2 = levels.okToEndorse(
    aliceJoinBob,      // from: <alice ∧ bob; alice ∨ bob>
    targetForEndorse,  // to:   <alice ∧ bob; False>
    TRUST_ROOT,        // authority
    IFC_BOT,           // blocking level
    false              // isNMIFC
);
console.log(`  From:      ${aliceJoinBob.stringRep()} (corrupt: ${aliceJoinBob.isCorrupt()})`);
console.log(`  To:        ${targetForEndorse.stringRep()} (corrupt: ${targetForEndorse.isCorrupt()})`);
console.log(`  Authority: ${TRUST_ROOT.stringRep()}`);
console.log(`  Result:    ${formatResult(endorseResult2)}`);

// Test 6: NMIFC checks
console.log("\n\n6. NMIFC enforcement (robust declassification, transparent endorsement):");
console.log("-".repeat(40));

// Test robust declassification
// For robustness: (S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from
// With alice label at pc=BOT, declassifying alice → BOT should fail NMIFC
// because I_from = alice, I_pc = FALSE, so we need (S_auth ∨ alice) ∧ TRUE ⟹ alice
// With ROOT auth: (FALSE ∨ alice) ∧ TRUE = alice ⟹ alice ✓

console.log("\nTest: Declassify {alice} → {} with ROOT auth, pc=BOT:");
const aliceToBotResult = levels.okToDeclassify(
    alice,         // from: {alice}
    IFC_BOT,       // to: {}  -- but integrity must match!
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    true,          // isNMIFC
    IFC_BOT        // pc
);
console.log(`  Result: ${formatResult(aliceToBotResult)}`);
console.log(`  (Expected: INTEGRITY_MISMATCH - alice has I=alice, BOT has I=FALSE)`);

// Create a proper declassification target (same integrity as alice)
const alicePublic = new DCLabel(CNF_TRUE, alice.integrity);
console.log("\nTest: Declassify {alice} → <True; alice> with ROOT auth, pc=BOT:");
const aliceToPublicResult = levels.okToDeclassify(
    alice,         // from: <alice; alice>
    alicePublic,   // to:   <True; alice>
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    true,          // isNMIFC
    IFC_BOT        // pc
);
console.log(`  From: ${alice.stringRep()} (corrupt: ${alice.isCorrupt()})`);
console.log(`  To:   ${alicePublic.stringRep()} (corrupt: ${alicePublic.isCorrupt()})`);
console.log(`  PC:   ${IFC_BOT.stringRep()} (corrupt: ${IFC_BOT.isCorrupt()})`);
console.log(`  Result: ${formatResult(aliceToPublicResult)}`);

// Now test with low-integrity PC (attacker-controlled context)
console.log("\nTest: Same declassification but with pc=TRUST_NULL (low integrity):");
const aliceToPublicLowPC = levels.okToDeclassify(
    alice,         // from: <alice; alice>
    alicePublic,   // to:   <True; alice>
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    true,          // isNMIFC
    TRUST_NULL     // pc = <TRUE; TRUE> (low integrity)
);
console.log(`  From: ${alice.stringRep()} (corrupt: ${alice.isCorrupt()})`);
console.log(`  To:   ${alicePublic.stringRep()} (corrupt: ${alicePublic.isCorrupt()})`);
console.log(`  PC:   ${TRUST_NULL.stringRep()} (corrupt: ${TRUST_NULL.isCorrupt()})`);
console.log(`  Result: ${formatResult(aliceToPublicLowPC)}`);
console.log(`  Robustness check: (S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from`);
console.log(`                    (FALSE ∨ alice ∨ TRUE) ∧ TRUE ⟹ alice`);
console.log(`                    TRUE ⟹ alice -- FALSE! Attacker can influence declassification.`);

// Test transparent endorsement
console.log("\n\nTest: Transparent endorsement");
console.log("-".repeat(40));

// Create a low-integrity value to endorse
const untrusted = new DCLabel(CNF_TRUE, CNF_TRUE);  // <TRUE; TRUE> = TRUST_NULL
const trusted = new DCLabel(CNF_TRUE, CNF_FALSE);   // <TRUE; FALSE> = fully trusted, public

console.log("\nTest: Endorse TRUST_NULL → <True;False> with ROOT auth, pc=BOT:");
const endorseUntrustedResult = levels.okToEndorse(
    untrusted,     // from: <TRUE; TRUE>
    trusted,       // to:   <TRUE; FALSE>
    TRUST_ROOT,    // authority
    IFC_BOT,       // blocking level
    true,          // isNMIFC
    IFC_BOT        // pc
);
console.log(`  From: ${untrusted.stringRep()} (corrupt: ${untrusted.isCorrupt()})`);
console.log(`  To:   ${trusted.stringRep()} (corrupt: ${trusted.isCorrupt()})`);
console.log(`  PC:   ${IFC_BOT.stringRep()} (corrupt: ${IFC_BOT.isCorrupt()})`);
console.log(`  Result: ${formatResult(endorseUntrustedResult)}`);
console.log(`  Transparency: I_from ⟹ I_to ∨ (S_from ∧ S_pc)`);
console.log(`                TRUE ⟹ FALSE ∨ (TRUE ∧ TRUE)`);
console.log(`                TRUE ⟹ TRUE -- OK`);

// Test endorsing secret data
const secretUntrusted = new DCLabel(alice.confidentiality, CNF_TRUE);  // <alice; TRUE>
const secretTrusted = new DCLabel(alice.confidentiality, CNF_FALSE);   // <alice; FALSE>

console.log("\nTest: Endorse <alice;TRUE> → <alice;FALSE> with ROOT auth, pc=BOT:");
const endorseSecretResult = levels.okToEndorse(
    secretUntrusted,  // from: <alice; TRUE>
    secretTrusted,    // to:   <alice; FALSE>
    TRUST_ROOT,       // authority
    IFC_BOT,          // blocking level
    true,             // isNMIFC
    IFC_BOT           // pc = <TRUE; FALSE>
);
console.log(`  From: ${secretUntrusted.stringRep()} (corrupt: ${secretUntrusted.isCorrupt()})`);
console.log(`  To:   ${secretTrusted.stringRep()} (corrupt: ${secretTrusted.isCorrupt()})`);
console.log(`  PC:   ${IFC_BOT.stringRep()} (corrupt: ${IFC_BOT.isCorrupt()})`);
console.log(`  Result: ${formatResult(endorseSecretResult)}`);
console.log(`  Transparency: I_from ⟹ I_to ∨ (S_from ∧ S_pc)`);
console.log(`                TRUE ⟹ FALSE ∨ (alice ∧ TRUE)`);
console.log(`                TRUE ⟹ alice -- FALSE! Public code can't endorse.`);

// Test 7: Hypothesis testing
// When downgrading from ℓ_from to ℓ_to where ℓ_to does NOT flow to ℓ_from,
// NMIFC succeeds iff ℓ_from is NOT corrupt.
// Using PC = BOT and ROOT authority.

console.log("\n\n7. Hypothesis: NMIFC succeeds iff source is not corrupt");
console.log("-".repeat(60));

import { Category, CNF } from '../levels/DCLabels/cnf.mjs';
import { RegularLabel } from '../levels/DCLabels/label.mjs';
import Table from 'cli-table3';

function mkLabel(cTags: string[], iTags: string[]): DCLabel {
    // Create CNF from tags (conjunction of single-tag categories)
    const mkCNF = (tags: string[]): CNF => {
        if (tags.length === 0) return CNF_TRUE;
        const cats = new Set(tags.map(t => new Category([new RegularLabel(t)])));
        return new CNF(cats);
    };
    return new DCLabel(mkCNF(cTags), mkCNF(iTags));
}

interface TestCase {
    name: string;
    from: DCLabel;
    toDeclassify: DCLabel;  // Same I as from, different C
    toEndorse: DCLabel;     // Same C as from, different I
}

// Generate test cases with various labels
const testCases: TestCase[] = [
    {
        name: "Symmetric: {alice} (C=alice, I=alice)",
        from: mkLabel(['alice'], ['alice']),
        toDeclassify: new DCLabel(CNF_TRUE, mkLabel(['alice'], ['alice']).integrity),
        toEndorse: new DCLabel(mkLabel(['alice'], ['alice']).confidentiality, CNF_FALSE),
    },
    {
        name: "Asymmetric: <alice; bob> (C=alice, I=bob)",
        from: mkLabel(['alice'], ['bob']),
        toDeclassify: new DCLabel(CNF_TRUE, mkLabel(['alice'], ['bob']).integrity),
        toEndorse: new DCLabel(mkLabel(['alice'], ['bob']).confidentiality, CNF_FALSE),
    },
    {
        name: "Asymmetric: <bob; alice> (C=bob, I=alice)",
        from: mkLabel(['bob'], ['alice']),
        toDeclassify: new DCLabel(CNF_TRUE, mkLabel(['bob'], ['alice']).integrity),
        toEndorse: new DCLabel(mkLabel(['bob'], ['alice']).confidentiality, CNF_FALSE),
    },
    {
        name: "Join: {alice,bob} (C=alice∧bob, I=alice∨bob)",
        from: alice.join(bob),
        toDeclassify: new DCLabel(CNF_TRUE, alice.join(bob).integrity),
        toEndorse: new DCLabel(alice.join(bob).confidentiality, CNF_FALSE),
    },
    {
        name: "High C, low I: <alice; TRUE>",
        from: new DCLabel(alice.confidentiality, CNF_TRUE),
        toDeclassify: new DCLabel(CNF_TRUE, CNF_TRUE),
        toEndorse: new DCLabel(alice.confidentiality, CNF_FALSE),
    },
    {
        name: "Low C, high I: <TRUE; alice>",
        from: new DCLabel(CNF_TRUE, alice.confidentiality),
        toDeclassify: new DCLabel(CNF_TRUE, alice.confidentiality),  // Already at TRUE, so no change
        toEndorse: new DCLabel(CNF_TRUE, CNF_FALSE),
    },
    {
        name: "IFC_TOP: <FALSE; TRUE>",
        from: IFC_TOP,
        toDeclassify: new DCLabel(CNF_TRUE, IFC_TOP.integrity),
        toEndorse: new DCLabel(IFC_TOP.confidentiality, CNF_FALSE),
    },
    {
        name: "TRUST_NULL: <TRUE; TRUE>",
        from: TRUST_NULL,
        toDeclassify: new DCLabel(CNF_TRUE, TRUST_NULL.integrity),  // No change
        toEndorse: new DCLabel(TRUST_NULL.confidentiality, CNF_FALSE),
    },
];

console.log("\nPC = BOT (high integrity), Authority = ROOT\n");

const table = new Table({
    head: ['Label', 'Corrupt?', 'Decl NMIFC', 'End NMIFC', 'Hypothesis'],
    colWidths: [45, 10, 12, 11, 12],
    style: { head: [], border: [] }
});

let allMatch = true;

for (const tc of testCases) {
    const isCorrupt = tc.from.isCorrupt();

    // Test declassification (only if it's a real downgrade)
    // Real declassification: C_from is strictly more restrictive than C_to
    // i.e., C_to does NOT imply C_from
    const declIsRealDowngrade = !implies(tc.toDeclassify.confidentiality, tc.from.confidentiality);
    let declResult = "N/A";
    let declMatches = true;

    if (declIsRealDowngrade) {
        const declCheck = levels.okToDeclassify(
            tc.from,
            tc.toDeclassify,
            TRUST_ROOT,
            IFC_BOT,
            true,   // isNMIFC
            IFC_BOT // pc
        );
        const declSuccess = declCheck.kind === "SUCCESS";
        declResult = declSuccess ? "✓" : "✗";
        declMatches = declSuccess === !isCorrupt;
    }

    // Test endorsement (only if it's a real downgrade)
    // Real endorsement: I_to is strictly more trusted than I_from
    // i.e., I_from does NOT imply I_to
    const endIsRealDowngrade = !implies(tc.from.integrity, tc.toEndorse.integrity);
    let endResult = "N/A";
    let endMatches = true;

    if (endIsRealDowngrade) {
        const endCheck = levels.okToEndorse(
            tc.from,
            tc.toEndorse,
            TRUST_ROOT,
            IFC_BOT,
            true,   // isNMIFC
            IFC_BOT // pc
        );
        const endSuccess = endCheck.kind === "SUCCESS";
        endResult = endSuccess ? "✓" : "✗";
        endMatches = endSuccess === !isCorrupt;
    }

    const hypothesisHolds = declMatches && endMatches;
    allMatch = allMatch && hypothesisHolds;

    // Truncate name for display
    const displayName = tc.name.length > 42 ? tc.name.substring(0, 39) + "..." : tc.name;
    table.push([displayName, isCorrupt ? "yes" : "no", declResult, endResult, hypothesisHolds ? "✓" : "✗"]);
}

console.log(table.toString());

console.log("\n" + (allMatch ? "✓ Hypothesis holds for all test cases!" : "✗ Hypothesis does NOT hold for some cases"));

// Print details for any failures
console.log("\nDetailed results:");
for (const tc of testCases) {
    const isCorrupt = tc.from.isCorrupt();
    console.log(`\n${tc.name}:`);
    console.log(`  From: ${tc.from.stringRep()} (corrupt: ${isCorrupt})`);
    console.log(`  Reflection: ${tc.from.reflection().stringRep()}`);

    const declIsRealDowngrade = !implies(tc.toDeclassify.confidentiality, tc.from.confidentiality);
    if (declIsRealDowngrade) {
        const declCheck = levels.okToDeclassify(tc.from, tc.toDeclassify, TRUST_ROOT, IFC_BOT, true, IFC_BOT);
        console.log(`  Declassify to ${tc.toDeclassify.stringRep()}: ${formatResult(declCheck)}`);
    } else {
        console.log(`  Declassify: skipped (C already at target or less restrictive)`);
    }

    const endIsRealDowngrade = !implies(tc.from.integrity, tc.toEndorse.integrity);
    if (endIsRealDowngrade) {
        const endCheck = levels.okToEndorse(tc.from, tc.toEndorse, TRUST_ROOT, IFC_BOT, true, IFC_BOT);
        console.log(`  Endorse to ${tc.toEndorse.stringRep()}: ${formatResult(endCheck)}`);
    } else {
        console.log(`  Endorse: skipped (I already at target or more trusted)`);
    }
}

// Test 8: Trust anchor hypothesis
// Meeting with a trust anchor before joining preserves non-corruption
console.log("\n\n8. Trust anchor: meet before join preserves non-corruption");
console.log("-".repeat(60));

const trustAnchor = DCLabel.fromSingleTag('trust');
console.log(`\nTrust anchor t' = ${trustAnchor.stringRep()}`);
console.log(`Alice label a = ${alice.stringRep()}`);
console.log(`Bob label b = ${bob.stringRep()}`);

// Direct join (creates corruption)
const directJoin = alice.join(bob);
console.log(`\nDirect join: a ⊔ b = ${directJoin.stringRep()}`);
console.log(`  Corrupt: ${directJoin.isCorrupt()}`);

// Meet with trust anchor first
const aliceMeetTrust = alice.meet(trustAnchor);
const bobMeetTrust = bob.meet(trustAnchor);
console.log(`\nMeet with trust anchor:`);
console.log(`  a ⊓ t' = ${aliceMeetTrust.stringRep()}`);
console.log(`  b ⊓ t' = ${bobMeetTrust.stringRep()}`);

// Then join
const anchoredJoin = aliceMeetTrust.join(bobMeetTrust);
console.log(`\nAnchored join: (a ⊓ t') ⊔ (b ⊓ t') = ${anchoredJoin.stringRep()}`);
console.log(`  Corrupt: ${anchoredJoin.isCorrupt()}`);

// Verify the math
console.log(`\nVerification:`);
console.log(`  Expected S = (alice ∧ bob) ∨ trust`);
console.log(`  Expected I = (alice ∨ bob) ∧ trust`);
console.log(`  Check I ⟹ S: ${implies(anchoredJoin.integrity, anchoredJoin.confidentiality)}`);

// Test NMIFC on the anchored result
console.log(`\nNMIFC check on anchored join (should pass if not corrupt):`);
const anchoredDeclTarget = new DCLabel(CNF_TRUE, anchoredJoin.integrity);
const anchoredDeclResult = levels.okToDeclassify(
    anchoredJoin,
    anchoredDeclTarget,
    TRUST_ROOT,
    IFC_BOT,
    true,   // isNMIFC
    IFC_BOT // pc
);
console.log(`  Declassify to ${anchoredDeclTarget.stringRep()}: ${formatResult(anchoredDeclResult)}`);

const anchoredEndTarget = new DCLabel(anchoredJoin.confidentiality, CNF_FALSE);
const anchoredEndResult = levels.okToEndorse(
    anchoredJoin,
    anchoredEndTarget,
    TRUST_ROOT,
    IFC_BOT,
    true,   // isNMIFC
    IFC_BOT // pc
);
console.log(`  Endorse to ${anchoredEndTarget.stringRep()}: ${formatResult(anchoredEndResult)}`);

// Compare with direct join NMIFC (should fail)
console.log(`\nNMIFC check on direct join (should fail since corrupt):`);
const directDeclTarget = new DCLabel(CNF_TRUE, directJoin.integrity);
const directDeclResult = levels.okToDeclassify(
    directJoin,
    directDeclTarget,
    TRUST_ROOT,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  Declassify to ${directDeclTarget.stringRep()}: ${formatResult(directDeclResult)}`);

const directEndTarget = new DCLabel(directJoin.confidentiality, CNF_FALSE);
const directEndResult = levels.okToEndorse(
    directJoin,
    directEndTarget,
    TRUST_ROOT,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  Endorse to ${directEndTarget.stringRep()}: ${formatResult(directEndResult)}`);

// Test: Can we downgrade from a_1 to a_1 ⊓ t' ?
console.log(`\n${"─".repeat(60)}`);
console.log("Can we downgrade a_1 → a_1 ⊓ t' (and similarly b_1 → b_1 ⊓ t')?");
console.log(`${"─".repeat(60)}`);

console.log(`\nStarting label: a_1 = ${alice.stringRep()}`);
console.log(`Target label:   a_1 ⊓ t' = ${aliceMeetTrust.stringRep()}`);
console.log(`\nThis requires two steps:`);
console.log(`  1. Endorse:    <a, a> → <a, a ∧ t>  (increase integrity)`);
console.log(`  2. Declassify: <a, a ∧ t> → <a ∨ t, a ∧ t>  (decrease confidentiality)`);

// Step 1: Endorse from <a, a> to <a, a ∧ t>
const step1Target = new DCLabel(alice.confidentiality, aliceMeetTrust.integrity);
console.log(`\nStep 1: Endorse ${alice.stringRep()} → ${step1Target.stringRep()}`);
console.log(`  Source corrupt? ${alice.isCorrupt()}`);

const step1Result = levels.okToEndorse(
    alice,
    step1Target,
    TRUST_ROOT,
    IFC_BOT,
    true,   // isNMIFC
    IFC_BOT // pc
);
console.log(`  With ROOT authority: ${formatResult(step1Result)}`);

// With just trust authority
const step1ResultTrust = levels.okToEndorse(
    alice,
    step1Target,
    trustAnchor,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {trust} authority: ${formatResult(step1ResultTrust)}`);

// Step 2: Declassify from <a, a ∧ t> to <a ∨ t, a ∧ t>
console.log(`\nStep 2: Declassify ${step1Target.stringRep()} → ${aliceMeetTrust.stringRep()}`);
console.log(`  Source corrupt? ${step1Target.isCorrupt()} (need a∧t ⟹ a: ${implies(step1Target.integrity, step1Target.confidentiality)})`);

const step2Result = levels.okToDeclassify(
    step1Target,
    aliceMeetTrust,
    TRUST_ROOT,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With ROOT authority: ${formatResult(step2Result)}`);

// With just trust authority
const step2ResultTrust = levels.okToDeclassify(
    step1Target,
    aliceMeetTrust,
    trustAnchor,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {trust} authority: ${formatResult(step2ResultTrust)}`);

// What authority do we actually need for step 2?
// Standard check: S_auth ∧ S_to ⟹ S_from
// i.e., S_auth ∧ (a ∨ t) ⟹ a
console.log(`\n  Authority analysis for declassification:`);
console.log(`    Need: S_auth ∧ (a ∨ t) ⟹ a`);
console.log(`    With S_auth = t: t ∧ (a ∨ t) = t ⟹ a? ${implies(trustAnchor.confidentiality, alice.confidentiality)}`);
console.log(`    With S_auth = a: a ∧ (a ∨ t) = a ⟹ a? true`);

// Try with alice authority
const step2ResultAlice = levels.okToDeclassify(
    step1Target,
    aliceMeetTrust,
    alice,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {alice} authority: ${formatResult(step2ResultAlice)}`);

// Alternative order: Declassify first, then Endorse
console.log(`\n${"─".repeat(60)}`);
console.log("Alternative order: Declassify first, then Endorse");
console.log(`${"─".repeat(60)}`);

console.log(`\nThis requires two steps:`);
console.log(`  1. Declassify: <a, a> → <a ∨ t, a>  (decrease confidentiality)`);
console.log(`  2. Endorse:    <a ∨ t, a> → <a ∨ t, a ∧ t>  (increase integrity)`);

// Step 1 (alt): Declassify from <a, a> to <a ∨ t, a>
const altStep1Target = new DCLabel(aliceMeetTrust.confidentiality, alice.integrity);
console.log(`\nStep 1: Declassify ${alice.stringRep()} → ${altStep1Target.stringRep()}`);
console.log(`  Source corrupt? ${alice.isCorrupt()}`);

const altStep1Result = levels.okToDeclassify(
    alice,
    altStep1Target,
    TRUST_ROOT,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With ROOT authority: ${formatResult(altStep1Result)}`);

const altStep1ResultTrust = levels.okToDeclassify(
    alice,
    altStep1Target,
    trustAnchor,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {trust} authority: ${formatResult(altStep1ResultTrust)}`);

const altStep1ResultAlice = levels.okToDeclassify(
    alice,
    altStep1Target,
    alice,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {alice} authority: ${formatResult(altStep1ResultAlice)}`);

// Step 2 (alt): Endorse from <a ∨ t, a> to <a ∨ t, a ∧ t>
console.log(`\nStep 2: Endorse ${altStep1Target.stringRep()} → ${aliceMeetTrust.stringRep()}`);
console.log(`  Source corrupt? ${altStep1Target.isCorrupt()} (need a ⟹ a∨t: ${implies(altStep1Target.integrity, altStep1Target.confidentiality)})`);

const altStep2Result = levels.okToEndorse(
    altStep1Target,
    aliceMeetTrust,
    TRUST_ROOT,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With ROOT authority: ${formatResult(altStep2Result)}`);

const altStep2ResultTrust = levels.okToEndorse(
    altStep1Target,
    aliceMeetTrust,
    trustAnchor,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {trust} authority: ${formatResult(altStep2ResultTrust)}`);

const altStep2ResultAlice = levels.okToEndorse(
    altStep1Target,
    aliceMeetTrust,
    alice,
    IFC_BOT,
    true,
    IFC_BOT
);
console.log(`  With {alice} authority: ${formatResult(altStep2ResultAlice)}`);

// Downgrade summary table
console.log(`\nDowngrade path comparison:\n`);

const downgradeTable = new Table({
    head: ['Order', 'Step', 'From', 'To', 'ROOT', '{trust}', '{alice}'],
    style: { head: [], border: [] }
});

const step1AliceResult = levels.okToEndorse(alice, step1Target, alice, IFC_BOT, true, IFC_BOT);

downgradeTable.push(
    [
        'A',
        '1. Endorse',
        alice.stringRep(),
        step1Target.stringRep(),
        step1Result.kind === "SUCCESS" ? '✓' : '✗',
        step1ResultTrust.kind === "SUCCESS" ? '✓' : '✗',
        step1AliceResult.kind === "SUCCESS" ? '✓' : '✗'
    ],
    [
        'A',
        '2. Declassify',
        step1Target.stringRep(),
        aliceMeetTrust.stringRep(),
        step2Result.kind === "SUCCESS" ? '✓' : '✗',
        step2ResultTrust.kind === "SUCCESS" ? '✓' : '✗',
        step2ResultAlice.kind === "SUCCESS" ? '✓' : '✗'
    ],
    [
        'B',
        '1. Declassify',
        alice.stringRep(),
        altStep1Target.stringRep(),
        altStep1Result.kind === "SUCCESS" ? '✓' : '✗',
        altStep1ResultTrust.kind === "SUCCESS" ? '✓' : '✗',
        altStep1ResultAlice.kind === "SUCCESS" ? '✓' : '✗'
    ],
    [
        'B',
        '2. Endorse',
        altStep1Target.stringRep(),
        aliceMeetTrust.stringRep(),
        altStep2Result.kind === "SUCCESS" ? '✓' : '✗',
        altStep2ResultTrust.kind === "SUCCESS" ? '✓' : '✗',
        altStep2ResultAlice.kind === "SUCCESS" ? '✓' : '✗'
    ]
);

console.log(downgradeTable.toString());

console.log(`\nOrder A: Endorse first, then Declassify`);
console.log(`Order B: Declassify first, then Endorse`);
console.log(`\nBoth orders require {trust} + {alice} authority to complete.`);

// Summary
console.log(`\nSummary: Trust Anchor Pattern\n`);

const summaryTable = new Table({
    head: ['Operation', 'Result', 'Corrupt?', 'NMIFC'],
    style: { head: [], border: [] }
});

summaryTable.push(
    [
        'a ⊔ b (direct)',
        directJoin.stringRep(),
        directJoin.isCorrupt() ? 'yes' : 'no',
        directDeclResult.kind === "SUCCESS" ? '✓' : '✗'
    ],
    [
        '(a⊓t\') ⊔ (b⊓t\') (anchored)',
        anchoredJoin.stringRep(),
        anchoredJoin.isCorrupt() ? 'yes' : 'no',
        anchoredDeclResult.kind === "SUCCESS" ? '✓' : '✗'
    ]
);

console.log(summaryTable.toString());

console.log("\n" + "=".repeat(60));
console.log("Done.");
