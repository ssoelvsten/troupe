# Quarantine DCLabels Refactoring - Index

**Goal**: Align quarantine implementation with specification in `.experiments/quarantine-high-level-description.md`

**Status**: APPROVED - Ready for implementation

**Next Step**: Execute Step 3.1 (Modify checkLabel() for three-case ingress)

---

## Progress Summary

| Phase | Status | Steps Done |
|-------|--------|------------|
| 1. Configuration | COMPLETED | 2/2 |
| 2. DCLabel Methods | COMPLETED | 4/4 |
| 3. Ingress Logic | NOT STARTED | 0/1 |
| 4. Send Refactoring | NOT STARTED | 0/4 |
| 5. Testing | PARTIAL (5.2 blocked) | 0/3 |

---

## Phase 1: Configuration and Types
| Step | File | Status | Description |
|------|------|--------|-------------|
| 1.1 | [step-1.1-quarantine-config.md](step-1.1-quarantine-config.md) | COMPLETED | Create Ingress.mts with IntegrityOnlyDistrustAction enum |
| 1.2 | [step-1.2-cli-arg.md](step-1.2-cli-arg.md) | COMPLETED | Add CLI argument for integrity-only-distrust setting |

## Phase 2: DCLabel Classification Methods
| Step | File | Status | Description |
|------|------|--------|-------------|
| 2.1 | [step-2.1-is-regular-trust.md](step-2.1-is-regular-trust.md) | COMPLETED | Add isRegularTrust() function to Ingress.mts |
| 2.2 | [step-2.2-classify-for-ingress.md](step-2.2-classify-for-ingress.md) | COMPLETED | Add classifyForIngress() function to Ingress.mts |
| 2.3 | [step-2.3-quarantine-integrity.md](step-2.3-quarantine-integrity.md) | REMOVED | ~~Add quarantineIntegrity() method~~ - contradicts spec, use full quarantine() |
| 2.4 | [step-2.4-raise-integrity.md](step-2.4-raise-integrity.md) | REMOVED | ~~Add raiseIntegrityTo() method~~ - inline in deserialize.mts instead |

## Phase 3: Ingress Logic
| Step | File | Status | Description |
|------|------|--------|-------------|
| 3.1 | [step-3.1-three-case-ingress.md](step-3.1-three-case-ingress.md) | NOT STARTED | Modify checkLabel() for three-case quarantine logic |

## Phase 4: Send Refactoring
| Step | File | Status | Description |
|------|------|--------|-------------|
| 4.1 | [step-4.1-send-tuple-arity.md](step-4.1-send-tuple-arity.md) | NOT STARTED | Extend send.mts to accept 2 or 3-tuple |
| 4.2 | [step-4.2-send-with-qauth.md](step-4.2-send-with-qauth.md) | NOT STARTED | Add sendMessageWithQuarantineAuth to runtimeMonitored |
| 4.3 | [step-4.3-serialize-with-qauth.md](step-4.3-serialize-with-qauth.md) | NOT STARTED | Add serializeWithQuarantineAuth function |
| 4.4 | [step-4.4-runtime-interface.md](step-4.4-runtime-interface.md) | NOT STARTED | Wire up RuntimeInterface |

## Phase 5: Testing
| Step | File | Status | Description |
|------|------|--------|-------------|
| 5.1 | [step-5.1-unit-tests.md](step-5.1-unit-tests.md) | NOT STARTED | Create unit tests for partial quarantine |
| 5.2 | [step-5.2-multinode-tests.md](step-5.2-multinode-tests.md) | BLOCKED | Create multinode tests (distributed tests broken) |
| 5.3 | [step-5.3-regression.md](step-5.3-regression.md) | NOT STARTED | Run local test suite only |

---

## Execution Instructions

Each step file is self-contained and can be executed in a fresh Claude Code context. Steps should be executed in order within each phase. Phases can be executed sequentially.

**To execute a step:**
1. Open the step file
2. Follow the instructions in the file
3. Mark the step as COMPLETED in this INDEX.md file
4. Update the step file with completion notes

**Verification after each phase:**
- Phase 1: `make rt` should succeed
- Phase 2: `make rt` should succeed
- Phase 3: `make rt` should succeed, **test with qecho example** (see below)
- Phase 4: `make rt` should succeed, **test 3-tuple send with adapted qecho**
- Phase 5: `bin/golden` for regression, **qecho example for quarantine verification**

---

## IMPORTANT: Testing Quarantine Functionality

### Local Tests Do NOT Exercise Quarantine

**Quarantine only happens during multinode communication.** Local tests (`./local.sh`, `bin/golden`) are orthogonal to quarantine functionality - they verify general runtime behavior but tell us nothing about quarantine correctness.

### Distributed Test Infrastructure Status

Distributed/multinode tests in `tests/rt/multinode-tests/` are currently **BROKEN**. Do NOT use `make test`.

### Primary Verification: Quarantine Echo Example

Use the existing quarantine echo example for manual verification:

```
examples/network/quarantine-echo-01/
├── qecho-server.trp  # Server that receives quarantined data, extracts quarantineAuth
├── qecho-client.trp  # Client that sends labeled data to server
└── (config files)
```

**What the example tests:**
- Server receives message from untrusted client
- Data is quarantined with `quarantineAuth` in metadata
- Server extracts and uses quarantine authority
- Round-trip message with label handling

**To run manually:**
```bash
# Terminal 1: Start server
./network.sh examples/network/quarantine-echo-01/qecho-server.trp <server-args>

# Terminal 2: Start client
./network.sh examples/network/quarantine-echo-01/qecho-client.trp <client-args>
```

### Verification Strategy

| What | How | Purpose |
|------|-----|---------|
| Build succeeds | `make rt` | Syntax and type correctness |
| Local tests pass | `bin/golden` | No regression in unrelated code |
| Quarantine works | Run qecho example | Verify actual quarantine behavior |

### Adapting qecho for New Features

When implementing changes, adapt the qecho example to test:
1. **Partial quarantine (Phase 3)**: Modify client to send data with integrity-only overclaim
2. **3-tuple send (Phase 4)**: Modify server to use `send(pid, msg, qauth)` for reply

---

## Key Reference Files

- Specification: `.experiments/quarantine-high-level-description.md`
- Ingress policy: `rt/src/Ingress.mts`
- DCLabel: `rt/src/levels/DCLabels/dclabel.mts`
- Deserialize: `rt/src/deserialize.mts`
- Send builtin: `rt/src/builtins/send.mts`
- Runtime: `rt/src/runtimeMonitored.mts`
- Serialize: `rt/src/serialize.mts`
