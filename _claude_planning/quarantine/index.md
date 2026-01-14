This document contains an overview of all the steps we need to implement quarantines.

## Plan

1. **Create a basic example skeleton** [DONE]
   - Location: `examples/network/quarantine-echo-01/`
   - Two nodes: client and server
   - Asymmetric trust: client trusts server at `{alice}`, server doesn't trust client
   - Uses static trustmap approach (recommended for simplicity)
   - Demonstrates trust-based level downgrading on receive

2. **Check existing metadata access for messages in runtime**
   - Investigate what metadata information about messages is currently available
   - Check how to access sender information, original labels, etc.

3. **Extend runtime and frontend for record-based metadata approach**
   - Support record-based metadata as outlined in section 6.3 of the Troupe security model PDF
   - Implement quarantine protocol as outlined in section 4.1.2 of the PDF

4. **Revisit the example**
   - Update quarantine-echo-01 to use new metadata support
   - Demonstrate quarantine protocol in action

5. **Expand example for gate call idiom**
   - Support gate call idiom from HiStar and Zagibeylo's papers
   - Create extended example demonstrating gate calls

## Notes

### Trust Configuration Approaches

For this development, we chose the **static approach** for trust configuration:
- Trust relationships defined in JSON trustmap files
- Files loaded at node startup via `--trustmap` flag
- Simple, explicit, and easy to debug
- Format: `[{"id": "<peer-id>", "level": "<label>"}]`

Alternative (programmatic) approach would allow runtime trust negotiation but adds complexity.

### Example Location

The example skeleton is at `examples/network/quarantine-echo-01/` rather than in tests because:
- It's a development example, not an automated test
- Allows for interactive exploration and modification
- Can be converted to an automated test later once stable
