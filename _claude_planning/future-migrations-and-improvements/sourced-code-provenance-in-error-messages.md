# Source Provenance in Error Messages

Because Troupe is dynamically typed there are many possibilities for runtime errors. Until now, we have given low priority to the quality of these error messages. But we would like to improve the situation.

As a first matter, we want to make sure that as many of runtime errors as possible include source information.

## Status: ANALYSIS COMPLETE

**Action Item 1**: ✓ COMPLETE - Thorough analysis prepared in `missing_source_provenance_errors.md`

**Findings**:
- Only ~8 of ~40+ error patterns include source location
- Root causes: empty filename in parser, limited IR position tracking, no runtime position context
- Recommended solution: V3 Source Maps + IR Position Extension

**Next Steps**:
- See `missing_source_provenance_errors.md` for the implementation plan
- See `/Users/aslan/.claude/plans/compiled-humming-treehouse.md` for detailed code examples

## Original Context

This needs to be done in a systematic way. One way to approach this is to look through the negative tests that we have, check out the error messages that clearly do not include the source information (source file, line number, etc) in the error messages and give me a list of error messages that lack this information.

Remember that Troupe is a dynamic language where we may be running code originates from another machine and comes to us only in the form of the IR, so the source information may not even be available. Our error reporting needs to be aware of all these and other potential subtleties. So, we need to think hard about this aspect afterwards in the code updates so that the proposed fixes are not one-sided. 