# Troupe libp2p Upgrade Plan: v0.45.3 → v2.8.9

## Executive Summary
Troupe currently uses libp2p v0.45.3, which is significantly outdated. The latest version is v2.8.9 (as of June 2025). This upgrade involves major architectural changes including TypeScript rewrite, ESM modules, interface consolidation, and extracted services.

## Current State Analysis

### Current Implementation
- **Current libp2p version**: v0.45.3
- **Latest libp2p version**: v2.8.9
- **Main usage locations**:
  - `/rt/src/p2p/p2p.mts` - Main P2P networking implementation
  - `/p2p-tools/mkid.mts` - Peer ID generation utility

### Current Dependencies
```json
"libp2p": "^0.45.3",
"@chainsafe/libp2p-noise": "^12.0.1",
"@chainsafe/libp2p-yamux": "^4.0.2",
"@libp2p/bootstrap": "^8.0.0",
"@libp2p/kad-dht": "^9.3.4",
"@libp2p/mdns": "^8.0.0",
"@libp2p/mplex": "^8.0.3",
"@libp2p/tcp": "^7.0.1",
"@libp2p/websockets": "^6.0.1"
```

## Key Breaking Changes Summary

### 1. Module System
- Complete migration from CommonJS to ESM-only modules
- All imports must use ESM syntax

### 2. TypeScript Rewrite
- Entire libp2p codebase rewritten in TypeScript
- New, more stable APIs with better type safety
- Improved developer experience

### 3. Interface Consolidation
- All interfaces consolidated into:
  - `@libp2p/interface` for public APIs
  - `@libp2p/interface-internal` for internal APIs

### 4. Service Extraction
Services now published as separate packages:
- AutoNAT: `@libp2p/autonat`
- Ping: `@libp2p/ping`
- Identify: `@libp2p/identify`
- DCUtR: `@libp2p/dcutr`
- Circuit Relay: `@libp2p/circuit-relay-v2`

### 5. PeerId Architecture Changes
- PeerIds are now lightweight wrappers around Uint8Arrays
- No embedded private keys
- Private key operations moved to `@libp2p/crypto`

### 6. API Changes
- Factory functions instead of constructors
- `connectionEncryption` → `connectionEncrypters`
- Stream operations now async
- Stats moved directly onto objects
- Error handling uses `.name` instead of `.code`

## Detailed Code Changes Required

### 1. Package.json Updates

```json
// Remove
"libp2p": "^0.45.3"

// Add
"libp2p": "^2.8.9",
"@libp2p/identify": "^3.x.x",
"@libp2p/ping": "^2.x.x",
"@libp2p/circuit-relay-v2": "^2.x.x",
"@libp2p/crypto": "^5.x.x",
"@libp2p/peer-id": "^5.x.x"
```

### 2. Import Changes in p2p.mts

**Current imports (lines 58-84):**
```typescript
import { PeerId } from '@libp2p/interface-peer-id';
import { createLibp2p as create } from 'libp2p';
import { createFromJSON, createEd25519PeerId } from '@libp2p/peer-id-factory';
import { peerIdFromString } from '@libp2p/peer-id';
import { identifyService } from 'libp2p/identify';
import { circuitRelayTransport } from 'libp2p/circuit-relay';
```

**Updated imports:**
```typescript
import type { PeerId, Connection, Stream, PrivateKey } from '@libp2p/interface';
import { createLibp2p } from 'libp2p';
import { peerIdFromString, peerIdFromPrivateKey } from '@libp2p/peer-id';
import { generateKeyPair, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { circuitRelayV2 } from '@libp2p/circuit-relay-v2';
```

### 3. Libp2p Node Creation (lines 209-246)

**Current implementation:**
```typescript
async function createLibp2p(_options) {
  const defaults = {
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${__port}`]
    },
    transports: [
      tcp(),
      webSockets(),
      circuitRelayTransport({
        discoverRelays: 1,
      })
    ],
    connectionEncryption: [
      noise(),
    ],
    services: {
      dht: kadDHT(),
      identify: identifyService(),
    },
  };
  return create(defaultsDeep(_options, defaults));
}
```

**Updated implementation:**
```typescript
async function createLibp2p(_options) {
  const defaults = {
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${__port}`]
    },
    transports: [
      tcp(),
      webSockets(),
      circuitRelayV2.transport({
        discoverRelays: 1,
      })
    ],
    connectionEncrypters: [  // renamed from connectionEncryption
      noise(),
    ],
    services: {
      dht: kadDHT(),
      identify: identify(),  // new import
    },
  };
  return createLibp2p(defaultsDeep(_options, defaults));  // no more 'create' alias
}
```

### 4. PeerId Handling (lines 139-204 and 253-277)

**Current startp2p function:**
```typescript
async function startp2p(nodeId, rt: any): Promise<String> {
  let id : PeerId = await obtainPeerId(nodeId);
  let nodeListener: Libp2p = await createLibp2p({
    peerId: id,
  });
  // ...
  return id.toString();
}
```

**Updated startp2p function:**
```typescript
async function startp2p(nodeId, rt: any): Promise<String> {
  let privateKey: PrivateKey = await obtainPrivateKey(nodeId);
  let nodeListener: Libp2p = await createLibp2p({
    privateKey: privateKey,  // pass privateKey instead of peerId
  });
  let id = nodeListener.peerId;  // get peerId from node
  // ...
  return id.toString();
}
```

**Current obtainPeerId function:**
```typescript
async function obtainPeerId(nodeId): Promise<PeerId> {    
  let id: PeerId = null;
  if(nodeId) {
    try {
      id = await createFromJSON(nodeId);
      debug(`Loaded id from file: ${id.toString()}`);
    } catch (err) {
      error(`Error creating peer id from json: ${err}`);
      throw err;    
    }
  } else {
    try {
      debug("Creating new peer id...");
      id = await createEd25519PeerId();
      debug("Created new peer id");
    } catch (err) {
      error(`Error creating new peer id: ${err}`);
      throw err;
    }
  }
  return id;
}
```

**Updated obtainPrivateKey function:**
```typescript
async function obtainPrivateKey(nodeId): Promise<PrivateKey> {    
  let privateKey: PrivateKey = null;
  if(nodeId) {
    try {
      // Assuming nodeId contains privKey field
      privateKey = await privateKeyFromProtobuf(nodeId.privKey);
      debug(`Loaded private key from file`);
    } catch (err) {
      error(`Error creating private key from json: ${err}`);
      throw err;    
    }
  } else {
    try {
      debug("Creating new private key...");
      privateKey = await generateKeyPair('Ed25519');
      debug("Created new private key");
    } catch (err) {
      error(`Error creating new private key: ${err}`);
      throw err;
    }
  }
  return privateKey;
}
```

### 5. Stream Handling Updates (lines 449-489)

**Async stream closing in setupConnection:**
```typescript
// Current
await _node.hangUp(peerId);

// Updated - ensure streams are closed properly
if (stream && stream.close) {
  await stream.close();  // now async
}
await _node.hangUp(peerId);
```

### 6. Connection Stats Access

**Update any code accessing stats:**
```typescript
// Current
stream.stat.direction
stream.stat.protocol
connection.stat.timeline

// Updated - stats moved directly to object
stream.direction
stream.protocol
connection.timeline
```

### 7. Error Handling Updates (lines 959-1014)

**Update processExpectedNetworkErrors:**
```typescript
// Current
if(err.code) {
  switch (err.code) {
    case 'ENETUNREACH':
    // ...
  }
}

// Updated
if(err.name) {
  switch (err.name) {
    case 'NetworkUnreachableError':  // error names may have changed
    // ...
  }
}
```

### 8. mkid.mts Updates

**Current implementation:**
```typescript
import { createEd25519PeerId } from '@libp2p/peer-id-factory'

let peerid = await createEd25519PeerId();
const obj = {
  id : peerid.toString(),
  privKey : uint8ArrayToString(peerid.privateKey, 'base64pad'),
  pubKey : uint8ArrayToString(peerid.publicKey, 'base64pad')
};
```

**Updated implementation:**
```typescript
import { generateKeyPair } from '@libp2p/crypto/keys'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'

const privateKey = await generateKeyPair('Ed25519');
const peerId = peerIdFromPrivateKey(privateKey);
const obj = {
  id : peerId.toString(),
  privKey : uint8ArrayToString(privateKey.raw, 'base64pad'),
  pubKey : uint8ArrayToString(privateKey.public.raw, 'base64pad')
};
```

## Migration Strategy

### Phase 1: Preparation
1. Create a feature branch: `feature/libp2p-v2-upgrade`
2. Set up comprehensive P2P tests
3. Document current P2P behavior

### Phase 2: Incremental Migration
1. **Step 1**: Upgrade v0.45 → v0.46
   - Update stream handling to async
   - Move stat properties
   - Test thoroughly

2. **Step 2**: Upgrade v0.46 → v1.0.0
   - Extract services to separate packages
   - Update imports
   - Switch to PrivateKey-based initialization
   - Test thoroughly

3. **Step 3**: Upgrade v1.0.0 → v2.0.0
   - Update PeerId interface usage
   - Fix error handling
   - Rename configuration options
   - Final testing

### Phase 3: Testing
1. **Unit Tests**:
   - Test peer ID generation
   - Test connection establishment
   - Test message sending/receiving

2. **Integration Tests**:
   - Test remote spawn operations
   - Test whereis functionality
   - Test relay connectivity
   - Test peer discovery

3. **Performance Tests**:
   - Compare connection establishment times
   - Test message throughput
   - Monitor resource usage

### Phase 4: Rollout
1. Deploy to test environment
2. Run extended testing
3. Monitor for issues
4. Deploy to production

## Risk Assessment

### High Risk Areas
- **PeerId changes**: Fundamental architecture change may introduce subtle bugs
- **Async operations**: Timing issues with stream closing
- **Service extraction**: Potential for missing services

### Medium Risk Areas
- **Performance**: New implementation may have different performance characteristics
- **Error handling**: Error types and codes have changed
- **Peer discovery**: May behave differently

### Low Risk Areas
- **Basic connectivity**: Core functionality remains similar
- **Message format**: Wire protocol unchanged
- **Configuration**: Most options map directly

## Rollback Plan
1. Keep the current implementation on a stable branch
2. Implement feature flags to switch between implementations
3. Monitor error rates and performance metrics
4. Have a quick rollback procedure ready

## Timeline Estimate
- **Phase 1 (Preparation)**: 2-3 days
- **Phase 2 (Migration)**: 5-7 days
- **Phase 3 (Testing)**: 3-5 days
- **Phase 4 (Rollout)**: 2-3 days

**Total estimate**: 2-3 weeks for complete migration

## Additional Notes

1. **Backward Compatibility**: The new version is not backward compatible with v0.45.x nodes
2. **Node.js Version**: Ensure Node.js v16+ is used (required by new libp2p)
3. **Documentation**: Official migration guides are in the libp2p GitHub repository under `/doc/migrations/`
4. **Support**: The libp2p community is active and can help with migration issues

## References
- [libp2p v0.45 to v0.46 Migration](https://github.com/libp2p/js-libp2p/blob/main/doc/migrations/v0.45-v0.46.md)
- [libp2p v0.46 to v1.0.0 Migration](https://github.com/libp2p/js-libp2p/blob/main/doc/migrations/v0.46-v1.0.0.md)
- [libp2p v1.0.0 to v2.0.0 Migration](https://github.com/libp2p/js-libp2p/blob/main/doc/migrations/v1.0.0-v2.0.0.md)
- [libp2p Documentation](https://docs.libp2p.io/)
- [libp2p GitHub Repository](https://github.com/libp2p/js-libp2p)