# Tier 5: libp2p v3 Ecosystem Migration

**Risk Level**: High
**Effort**: Significant
**Dependencies**: Complete Tiers 1-4 first recommended

## Overview

This is a major upgrade of the entire libp2p networking stack from v2.x to v3.x. All libp2p-related packages must be updated together as they have interdependencies.

## Packages to Update

| Package                      | Current   | Latest    | Major Jump |
|------------------------------|-----------|-----------|------------|
| `libp2p`                     | 2.10.0    | 3.1.2     | 2 → 3      |
| `@chainsafe/libp2p-noise`    | 16.1.4    | 17.0.0    | 16 → 17    |
| `@chainsafe/libp2p-yamux`    | 7.0.4     | 8.0.1     | 7 → 8      |
| `@libp2p/bootstrap`          | 11.0.47   | 12.0.10   | 11 → 12    |
| `@libp2p/circuit-relay-v2`   | 3.2.24    | 4.1.2     | 3 → 4      |
| `@libp2p/crypto`             | 5.1.8     | 5.1.13    | (patch)    |
| `@libp2p/identify`           | 3.0.39    | 4.0.9     | 3 → 4      |
| `@libp2p/interface`          | 2.11.0    | 3.1.0     | 2 → 3      |
| `@libp2p/kad-dht`            | 14.2.15   | 16.1.2    | 14 → 16    |
| `@libp2p/logger`             | 5.2.0     | 6.2.2     | 5 → 6      |
| `@libp2p/mdns`               | 11.0.47   | 12.0.10   | 11 → 12    |
| `@libp2p/mplex`              | 11.0.47   | 12.0.10   | 11 → 12    |
| `@libp2p/peer-id`            | 5.1.9     | 6.0.4     | 5 → 6      |
| `@libp2p/peer-store`         | 11.2.7    | 12.0.9    | 11 → 12    |
| `@libp2p/tcp`                | 10.1.19   | 11.0.9    | 10 → 11    |
| `@libp2p/websockets`         | 9.2.19    | 10.1.2    | 9 → 10     |

---

## Affected Files

### Core Runtime P2P

**File**: `rt/src/p2p/p2p.mts`

```typescript
// Line 58
import type { PeerId } from '@libp2p/interface';

// Lines 60-71
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { mplex } from '@libp2p/mplex';
import { Libp2p, createLibp2p as create } from 'libp2p';
import { keys } from '@libp2p/crypto';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { peerIdFromString } from '@libp2p/peer-id';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';

// Lines 80-85
import { identify } from '@libp2p/identify';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { kadDHT } from '@libp2p/kad-dht';
```

### Relay Server

**File**: `p2p-tools/relay/relay.mts`

```typescript
// Lines 3-10
import { mplex } from '@libp2p/mplex';
import { webSockets } from '@libp2p/websockets';
import { logger } from '@libp2p/logger'
import { createLibp2p } from 'libp2p';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { keys } from '@libp2p/crypto';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
```

**File**: `p2p-tools/relay/relay.mjs` (compiled version - will be regenerated)

### ID Generation Tool

**File**: `p2p-tools/mkid.mts`

```typescript
// Lines 9-10
import { keys } from '@libp2p/crypto'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
```

---

## Known Breaking Changes in libp2p v3

### 1. Configuration Structure

The libp2p configuration structure has changed. Services are now configured differently:

**v2 style**:
```typescript
const node = await createLibp2p({
  transports: [tcp(), webSockets()],
  streamMuxers: [mplex()],
  connectionEncrypters: [noise()],
  services: {
    identify: identify(),
    dht: kadDHT()
  }
})
```

**v3 style** (may differ):
```typescript
const node = await createLibp2p({
  transports: [tcp(), webSockets()],
  streamMuxers: [yamux(), mplex()], // yamux preferred
  connectionEncrypters: [noise()],
  services: {
    identify: identify(),
    dht: kadDHT()
  }
})
```

### 2. PeerId API Changes

The `@libp2p/peer-id` package may have API changes:
- `peerIdFromPrivateKey` signature
- `peerIdFromString` signature
- Type imports

### 3. Event Names

Event listener names may have changed. Current usage in `p2p.mts`:
```typescript
_node.addEventListener('self:peer:update', (_) => { ... })
```

### 4. Circuit Relay

The circuit relay API may have changes:
- `circuitRelayTransport` (client side)
- `circuitRelayServer` (server side)

### 5. Kad-DHT

The DHT configuration may have changed in v16.

---

## Pre-Migration Research Required

Before executing this migration, research the following:

### 1. libp2p v3 Migration Guide

Check for official migration documentation:
- https://github.com/libp2p/js-libp2p/releases
- https://github.com/libp2p/js-libp2p/blob/main/CHANGELOG.md
- https://docs.libp2p.io/

### 2. Package Compatibility Matrix

Verify all packages are compatible with each other at their target versions.

### 3. Node.js Requirements

Check minimum Node.js version requirements for libp2p v3.

---

## Execution Steps

### Phase 1: Preparation

```bash
cd /Users/aslan/Prime/Troupe

# Create a feature branch for this work
git checkout -b feature/libp2p-v3-migration

# Ensure current state works
make test
./scripts/run-multinode-tests.sh
```

### Phase 2: Update All Packages

Update `package.json` dependencies section:

```json
{
  "dependencies": {
    "@chainsafe/libp2p-noise": "^17.0.0",
    "@chainsafe/libp2p-yamux": "^8.0.0",
    "@libp2p/bootstrap": "^12.0.0",
    "@libp2p/circuit-relay-v2": "^4.0.0",
    "@libp2p/crypto": "^5.1.13",
    "@libp2p/identify": "^4.0.0",
    "@libp2p/interface": "^3.0.0",
    "@libp2p/kad-dht": "^16.0.0",
    "@libp2p/logger": "^6.0.0",
    "@libp2p/mdns": "^12.0.0",
    "@libp2p/mplex": "^12.0.0",
    "@libp2p/peer-id": "^6.0.0",
    "@libp2p/peer-store": "^12.0.0",
    "@libp2p/tcp": "^11.0.0",
    "@libp2p/websockets": "^10.0.0",
    "libp2p": "^3.0.0",
    // ... other dependencies unchanged
  }
}
```

### Phase 3: Install and Check Errors

```bash
npm install

# Check for TypeScript errors
npx tsc --noEmit
```

### Phase 4: Fix Import Errors

Based on TypeScript errors, update imports in:
1. `rt/src/p2p/p2p.mts`
2. `p2p-tools/relay/relay.mts`
3. `p2p-tools/mkid.mts`

### Phase 5: Fix API Usage

Based on TypeScript errors and runtime issues, update:
1. `createLibp2p` configuration
2. Event listener names
3. PeerId creation/parsing
4. Service configurations

### Phase 6: Rebuild

```bash
make rt
```

### Phase 7: Test Local Functionality

```bash
# Basic runtime test
./local.sh tests/rt/pos/core/simple.trp

# Run standard tests
make test
```

### Phase 8: Test Multinode Functionality

```bash
# Run multinode tests
./scripts/run-multinode-tests.sh

# Or individual test
./scripts/multinode-runner.sh tests/rt/multinode-tests/basic-echo/config.json
```

---

## Potential Code Changes

### rt/src/p2p/p2p.mts - Likely Changes

```typescript
// The createLibp2p configuration may need updates
// Check for:
// 1. New required services
// 2. Changed option names
// 3. New type requirements

// Event listeners may need updates
_node.addEventListener('self:peer:update', ...) // may be renamed

// PeerId functions may have new signatures
peerIdFromPrivateKey(key) // check if signature changed
peerIdFromString(str) // check if signature changed
```

### p2p-tools/relay/relay.mts - Likely Changes

```typescript
// circuitRelayServer configuration may have changed
circuitRelayServer({
  // check new options
})
```

---

## Testing Strategy

### Unit Tests

1. Run `make test` to verify core functionality

### Integration Tests

1. Local execution: `./local.sh tests/rt/pos/core/simple.trp`
2. P2P tests: Check any p2p-specific tests

### Multinode Tests

Critical tests to run:
1. `tests/rt/multinode-tests/basic-echo/`
2. Any other multinode test configurations

### Manual Testing

1. Start a relay server: `node p2p-tools/relay/relay.mjs`
2. Connect nodes through the relay
3. Test message passing between nodes

---

## Rollback Plan

If migration fails:

```bash
# Discard all changes
git checkout .
git clean -fd

# Or reset to before migration
git checkout dev-integrity-npm-updates

# Reinstall original packages
npm install
```

---

## package.json Changes Summary

### Before

```json
{
  "dependencies": {
    "@chainsafe/libp2p-noise": "^16.1.0",
    "@chainsafe/libp2p-yamux": "^7.0.0",
    "@libp2p/bootstrap": "^11.0.0",
    "@libp2p/circuit-relay-v2": "^3.0.0",
    "@libp2p/crypto": "^5.0.0",
    "@libp2p/identify": "^3.0.0",
    "@libp2p/interface": "^2.0.0",
    "@libp2p/kad-dht": "^14.0.0",
    "@libp2p/logger": "^5.2.0",
    "@libp2p/mdns": "^11.0.0",
    "@libp2p/mplex": "^11.0.0",
    "@libp2p/peer-id": "^5.0.0",
    "@libp2p/peer-store": "^11.0.0",
    "@libp2p/tcp": "^10.0.0",
    "@libp2p/websockets": "^9.0.0",
    "libp2p": "^2.10.0",
    ...
  }
}
```

### After

```json
{
  "dependencies": {
    "@chainsafe/libp2p-noise": "^17.0.0",
    "@chainsafe/libp2p-yamux": "^8.0.0",
    "@libp2p/bootstrap": "^12.0.0",
    "@libp2p/circuit-relay-v2": "^4.0.0",
    "@libp2p/crypto": "^5.1.13",
    "@libp2p/identify": "^4.0.0",
    "@libp2p/interface": "^3.0.0",
    "@libp2p/kad-dht": "^16.0.0",
    "@libp2p/logger": "^6.0.0",
    "@libp2p/mdns": "^12.0.0",
    "@libp2p/mplex": "^12.0.0",
    "@libp2p/peer-id": "^6.0.0",
    "@libp2p/peer-store": "^12.0.0",
    "@libp2p/tcp": "^11.0.0",
    "@libp2p/websockets": "^10.0.0",
    "libp2p": "^3.0.0",
    ...
  }
}
```

---

## Post-Migration Checklist

- [ ] All libp2p packages updated to target versions
- [ ] `npm install` completes without errors
- [ ] `npx tsc --noEmit` shows no TypeScript errors
- [ ] `make rt` completes successfully
- [ ] `make test` passes all tests
- [ ] `./local.sh tests/rt/pos/core/simple.trp` works
- [ ] Relay server starts: `node p2p-tools/relay/relay.mjs`
- [ ] Multinode tests pass: `./scripts/run-multinode-tests.sh`
- [ ] No regression in P2P functionality

---

## Resources

- libp2p JS documentation: https://docs.libp2p.io/
- libp2p JS GitHub: https://github.com/libp2p/js-libp2p
- libp2p v3 release notes: https://github.com/libp2p/js-libp2p/releases
- Protocol Labs blog: https://blog.libp2p.io/

---

## Estimated Effort

This migration will likely require:
- Research: Review changelogs and migration guides
- Code changes: Update 3-4 source files
- Testing: Extensive testing of multinode functionality
- Debugging: Resolve any compatibility issues

Consider allocating dedicated time for this migration as a standalone project.
