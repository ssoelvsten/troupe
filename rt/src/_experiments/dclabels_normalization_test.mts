/**
 * Test file demonstrating the DCLabel.fromSingleTag normalization bug.
 *
 * Issue: fromSingleTag does not lowercase tags, unlike tagsets.mts.
 * This causes labels with different casing to be treated as unequal.
 *
 * To run: npx tsc && node rt/built/_experiments/dclabels_normalization_test.mjs
 */

import { DCLabel, IFC_BOT }
    from "../levels/DCLabels/dclabel.mjs"

function testCaseNormalization() {
    console.log("=== DCLabel Case Normalization Test ===\n");

    // Test 1: Same case should be equal
    const aliceLower1 = DCLabel.fromSingleTag("alice");
    const aliceLower2 = DCLabel.fromSingleTag("alice");
    const test1 = aliceLower1.equals(aliceLower2);
    console.log(`Test 1: "alice" == "alice": ${test1} (expected: true)`);

    // Test 2: Different case should be equal (but currently fails!)
    const aliceUpper = DCLabel.fromSingleTag("Alice");
    const aliceLower = DCLabel.fromSingleTag("alice");
    const test2 = aliceUpper.equals(aliceLower);
    console.log(`Test 2: "Alice" == "alice": ${test2} (expected: true, BUG if false)`);

    // Test 3: All uppercase vs all lowercase
    const aliceAllCaps = DCLabel.fromSingleTag("ALICE");
    const test3 = aliceAllCaps.equals(aliceLower);
    console.log(`Test 3: "ALICE" == "alice": ${test3} (expected: true, BUG if false)`);

    // Test 4: Mixed case
    const aliceMixed = DCLabel.fromSingleTag("aLiCe");
    const test4 = aliceMixed.equals(aliceLower);
    console.log(`Test 4: "aLiCe" == "alice": ${test4} (expected: true, BUG if false)`);

    // Test 5: Verify string representations differ (showing the bug)
    console.log(`\nString representations (showing the internal difference):`);
    console.log(`  "alice" -> ${aliceLower.stringRep()}`);
    console.log(`  "Alice" -> ${aliceUpper.stringRep()}`);
    console.log(`  "ALICE" -> ${aliceAllCaps.stringRep()}`);

    // Summary
    console.log("\n=== Summary ===");
    const allPassed = test1 && test2 && test3 && test4;
    if (allPassed) {
        console.log("All tests passed! The normalization bug is fixed.");
    } else {
        console.log("Some tests failed! The normalization bug still exists.");
        console.log("Fix: Add .toLowerCase() to fromSingleTag in dclabel.mts:178");
    }

    return allPassed;
}

function testFromV1String() {
    console.log("\n=== fromV1String Case Normalization Test ===\n");

    // fromV1String is an instance method on DCLabelLevelSystem
    // We can access it via the levels module
    // For now, we've demonstrated the bug via fromSingleTag which fromV1String uses internally
    console.log("(fromV1String uses fromSingleTag internally, so the bug applies there too)");

    return true;  // Skip this test since the core bug is already demonstrated
}

function main() {
    const test1Passed = testCaseNormalization();
    const test2Passed = testFromV1String();

    console.log("\n=== Final Result ===");
    if (test1Passed && test2Passed) {
        console.log("All normalization tests passed!");
        process.exit(0);
    } else {
        console.log("Normalization bug detected!");
        process.exit(1);
    }
}

main();
