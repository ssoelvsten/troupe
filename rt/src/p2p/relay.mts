import { Libp2p, PeerId } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from '@multiformats/multiaddr';

import { mkLogger } from '../logger.mjs';

import { getCliArgs, TroupeCliArg } from "../TroupeCliArgs.mjs";
import { reportExpectedErrors } from "./errorHandlers.mjs";
import { relays } from "./config.mjs";

const argv = getCliArgs();

const logLevel = argv[TroupeCliArg.DebugP2p] ? 'debug' : 'info';
const logger = mkLogger ('p2p/relay', logLevel);

// ----------------------------------------------------------------------------
// CONSTANTS

/** Protocol for peers to talk to relays */
const RELAY_PROTOCOL = "/trouperelay/keepalive";

/** Tag for keeping connections alive.
 *
 * @deprecated As mentioned below In circuit relay v2, we don't need to send
 *             keep-alive messages. Remove this!
 */
const KEEP_ALIVE = 'KEEP_ALIVE';

/** Time-out for keep-alive messages to relay */
const KEEP_ALIVE_TIMEOUT = 5000;

// ----------------------------------------------------------------------------
// GLOBAL STATE

/** The id for the relay */
export let relayId = null;

/** The number of times "keep-alive" has been sent to the relay. To use more
 *  than one relay, these should be kept in a table */
let _keepAliveCounter = 0;

// ----------------------------------------------------------------------------
// SET-UP

export async function dialRelays(node: Libp2p) {
    // To use more than one relay, make sure to dial them all
    if (relays.length === 0) {
        logger.debug("No relays configured, skipping relay dial");
        return;
    }

    dialRelay(node, relays[0]);
}

/**
 * Send keep-alive messages to a relay at `relayAddr`. If a message fails, do
 * an exponential backoff on the timeout for new tries.
 */
export async function dialRelay(node: Libp2p, relayAddr: string) {
  const id = relayAddr.split('/').pop();
  logger.debug(`Relay id is ${id}`);

  try {
    await __dialRelay(node, relayAddr);
    logger.debug(`Successfully connected to relay ${id}`);
  } catch (err) {
    logger.error(`Failed to connect to relay: ${err}`);
    reportExpectedErrors(err, "dialRelay");

    // Retry after a delay if connection fails
    setTimeout(() => dialRelay(node, relayAddr), 30000);
  }
}

/**
 * Dials the relay at `relayAddr`.
 */
async function __dialRelay(node: Libp2p, relayAddr: string) {
  try {
    logger.debug(`Dialing relay at ${relayAddr}`);
    const id = relayAddr.split('/').pop();
    const relayPeerId: PeerId = peerIdFromString(id);

    // Add the address to the peerStore. Tag the relay with "keep alive"
    await node.peerStore.merge(relayPeerId, {
      multiaddrs: [
        multiaddr(`${relayAddr}`)
      ],
      tags: {
        // TODO (2025-12-11; SS): If Libp2p already takes care of keeping this
        //                        alive, why are we (still?) doing this?
        [KEEP_ALIVE]: {}
      }
    });

    // Dial the relay - in circuit relay v2, we just dial without a
    // specific protocol.
    logger.debug(`Added relay address`);
    const connection = await node.dial(relayPeerId);
    logger.debug(`Relay dialed`);
    relayId = id;
    logger.debug(`Relay connected, keep alive counter is ${_keepAliveCounter++}`);

    // In circuit relay v2, we don't need to send keep-alive messages The
    // connection is maintained by libp2p automatically. Just return `null` since
    // we don't have a stream to return
  } catch (err) {
    reportExpectedErrors (err, "__dialRelay");
  }
}
