import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { mplex } from '@libp2p/mplex';
import { webSockets } from '@libp2p/websockets';
import { logger } from '@libp2p/logger'
import { createLibp2p } from 'libp2p';
import { circuitRelayServer } from 'libp2p/circuit-relay';
import { identifyService } from 'libp2p/identify';
import { createFromJSON } from '@libp2p/peer-id-factory';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import { readFileSync } from 'fs';

async function main () {
  const relayId  = readFileSync("keys/relay.id").toString();
  const relayKey = readFileSync("keys/relay.priv").toString();
  const id       = await createFromJSON({id : relayId, privKey : relayKey});

  const node = await createLibp2p({
    peerId : id,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/5555/ws']
    },
    transports: [
      webSockets()
    ],
    connectionEncryption: [
      noise()
    ],
    streamMuxers: [
      yamux(),
      mplex()
    ],
    services: {
      identify: identifyService(),
      relay: circuitRelayServer({ // makes the node function as a relay server
        /*
          The limits are set intentionally very high to avoid the relay cutting off
          the connection. This can seemingly not be disabled in any other way.
          (See: https://github.com/libp2p/specs/blob/f5c5829ef9753ef8b8a15d36725c59f0e9af897e/relay/circuit-v2.md?plain=1#L71)
          There is also no way to distinguish whether the relay cut off the connection
          because of a time/data limit or the other party cut off the connection. Therefore,
          it is impossible to know whether to re-establish the connection or not.

          Two alternatives to giving large limits were considered.
          - The good solution
          Implement the connections being intentionally broken by the peers involved
          before the relay reaches either limit. This would entail both timing and
          counting all the bytes sent on each relayed connection. This was rejected
          for being too time consuming, since the relay code might change soon anyway.

          - The hacky solution
          Use a version of libp2p where the code for breaking a connection is removed.
          This was rejected to allow for easier upgrading of the libp2p library.
        */
        reservations: {
          defaultDurationLimit: 2147483647,
          defaultDataLimit: BigInt(4294967295),
        }
      }),
    }
  });

  // HACK: Use 'libp2p' logger with the exact same logging 'address' as the one in
  //       'js-libp2p/packages/transport-circuit-relay-v2/src/server/index.ts'.
  const log = logger('libp2p:circuit-relay:server');

  // Log established connections
  const _CONNECT = 'peer:connect';
  await node.addEventListener(_CONNECT, async ({ detail }) => {
    log(`connection with ${detail} established`);
  });
  const _DISCONNECT = 'peer:disconnect';
  await node.addEventListener(_DISCONNECT, async ({ detail }) => {
    log(`disconnection from ${detail}`);
  });

  // Log 'keep alive' messages
  const _RELAY_PROTOCOL = '/trouperelay/keepalive';
  await node.handle(_RELAY_PROTOCOL, async ({ connection, stream }) => {
    const src_id = connection.remotePeer;

    // Log start of 'keep alive' protocol
    log(`initiating keep alive protocol with ${src_id}`);

    // Log each 'keep alive' message to the console
    pipe(
      stream.source,
      (source) => lp.decode(source),
      (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())),
      async (source) => {
        for await (const msg of source) {
          log(`keep alive from ${src_id}: '${msg.toString()}'`);
        }
      }
    );
  });

  // TODO: Log relayed traffic
  //
  // NOTE:
  //   For libp2p logging messages, please set the DEBUG environment variable to
  //   'libp2p*' or 'libp2p:circuit-relay:*'. For example:
  //
  //   ```
  //     DEBUG=libp2p:circuit-relay node relay.mjs
  //   ```
  //   To also log *all* traffic, also include '*libp2p:yamux:trace' in DEBUG.

  // Log set up of Relay node finished and its addresses.
  log(`Relay ready with id ${node.peerId.toString()}`);
  log('Listening on:');
  node.getMultiaddrs().forEach((ma) => log(`  ${ma.toString()}`));
    console.log('');
}

main();
