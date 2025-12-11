/*

The p2p runtime uses a Libp2p node to keep track of peers and connections.
A Publishable object is added to each stream to be used for sending messages.

A Publishable object is created in the following instances:

1. When we initate a connection to a node upon the first time, via
   node.dialProtocol because we are about to send a message (spawn or send) to
   that PeerId.

2. If we try to send a message and all open streams do not have a Publishable
   object that can be used.

3. When we receive a connection from some other in the callback passed to the
   node.handle. In this case it is just some other node that wants to connect to
   us and we are going to "cache" the connection.

Each of these Publishable objects is piped to the connection that is obtained in
the respective cases above.

Additionally, we pipe the connection to a drain sink that does the following:

1. Receive messages from the remote node: this is the normal opeeration. Upon
   receiving a message it will then communicate it back to our runtime (probably
   to the serialization layer) similarly to the way we handle messages now.

2. Upon the end of the pipe message we will also set up a handler that removes
   the publishable object from the lookup table. This should ensure that if we
   we want to communicate with that node later, we will dialing to that node.

The messages themselves can be one of the forms as documented in `Message.mts`.

Note on the code below: the code below uses the libp2p framework, and is
partially grown out of the Chat example in that framework (to make sense of the
control flow transfer in this part of the runtime it may be helpful look up of
the libp2p).

*/

// -------------------------------------------------------------------------------------------------
// IMPORTS

import type { PeerId, Stream } from '@libp2p/interface';
import { getCliArgs, TroupeCliArg } from '../TroupeCliArgs.mjs';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { mplex } from '@libp2p/mplex';
import { yamux } from '@chainsafe/libp2p-yamux';
import { noise } from '@chainsafe/libp2p-noise';
import defaultsDeep from '@nodeutils/defaults-deep';
import { Libp2p, createLibp2p as create } from 'libp2p';
import { keys } from '@libp2p/crypto';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { peerIdFromString } from '@libp2p/peer-id';
import { bootstrap } from '@libp2p/bootstrap';
import { mdns } from '@libp2p/mdns';
import { pipe } from 'it-pipe';
import * as lp from 'it-length-prefixed';
import map from 'it-map';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import { pushable } from 'it-pushable';
import { multiaddr } from '@multiformats/multiaddr';
import { identify } from '@libp2p/identify';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import {v4 as uuidv4} from 'uuid';
import { kadDHT } from '@libp2p/kad-dht';

import { Logger, mkLogger } from '../logger.mjs';

import { port, id as nodeId, bootstrappers, knownNodes } from './config.mjs';
import { MessageType, Message } from './Message.mjs';
import { RuntimeHandlers } from './RuntimeHandlers.mjs';
import { processExpectedNetworkErrors } from './errorHandlers.mjs';
import { dialRelays, relayId } from './relay.mjs';

// -------------------------------------------------------------------------------------------------
// LOGGING AND DEBUGGING

const argv = getCliArgs();

const logLevel = argv[TroupeCliArg.DebugP2p]? 'debug':'info';
const logger = mkLogger ('p2p', logLevel);

const info = x => logger.info(x);
const debug = x => logger.debug(x);
const error = x => logger.error(x);

// -------------------------------------------------------------------------------------------------
// CONSTANTS

/** Protocol for peers to talk to each other */
const PROTOCOL = "/troupe/1.0.0";

/** How often the health check happens 2020-02-10; AA; this should be an option */
const HEALTH_CHECK_PERIOD = 5000;

// -------------------------------------------------------------------------------------------------
// SET-UP

/** The libp2p node this peer uses */
let _node: Libp2p = null;

/** The runtime handlers */
let _rtHandlers: RuntimeHandlers  = null;

/**
 * Start the libp2p node that this peer will use. Also sets up the event queue block checker and the
 * connections to relays.
 */
export async function start(rtHandlers: RuntimeHandlers): Promise<string> {
  process.on('unhandledRejection', (e) => processExpectedNetworkErrors(e, "unhandledRejection"))
  process.on('uncaughtException', (e) => processExpectedNetworkErrors(e, "uncaughtException"))

  // Load or create a private key
  let privateKey = await obtainPrivateKey(nodeId);
  let id: PeerId;

  // Create the libp2p node
  try {
    let nodeListener: Libp2p = await createLibp2p({
      privateKey: privateKey,
    });

    await nodeListener.start();

    // Save the libp2p node and runtime handlers
    _node = nodeListener;
    _rtHandlers = rtHandlers;

    // Get the peer ID from the node
    id = nodeListener.peerId;

  } catch (err) {
    error(`Something wrong while creating Libp2p node: ${err}`);
    throw err;
  }

  // When a peer dials using the Troupe protocol, handle the connection
  await _node.handle(PROTOCOL, async ({ connection, stream }) => {
    debug(`Handling protocol dial from id: ${connection.remotePeer}`);
    setupConnection(connection.remotePeer, stream);
  });

  // When a node is discovered, save the address and report it on the debug logger
  _node.addEventListener('peer:discovery', async (evt) => {
    const peerInfo = evt.detail;
    await _node.peerStore.patch(peerInfo.id, {
      multiaddrs: peerInfo.multiaddrs
    });
    debug(`Discovered: ${peerInfo.id.toString()}`);
  });

  // When a node is connected to, report it on the debug logger
  _node.addEventListener('peer:connect', (evt) => {
    const peerId = evt.detail;
    debug(`Connection established to: ${peerId.toString()}`);
  });

  // When a node is disconnected from, report it on the debug logger
  _node.addEventListener('peer:disconnect', (evt) => {
    let id = evt.detail;
    debug(`Disconnect from ${id}`);
  });

  // When new addresses are added report it on the debug logger
  _node.addEventListener('self:peer:update', (_) => {
    debug(`Advertising with following addresses:`);
    _node.getMultiaddrs().forEach(m => debug(m.toString()));
  });

  debug("Libp2p node started");
  debug(`This node's id is ${id.toString()}`);

  // Set-up checking if the event queue is blocked
  setupBlockingHealthChecker(HEALTH_CHECK_PERIOD);

  // Dial relays.
  dialRelays(_node);

  return id.toString();
}

/**
 * Create the libp2p node that this peer will use.
 */
async function createLibp2p(_options) {
  const defaults = {
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`]
    },
    connectionManager : {
      minConnections: 1,
      maxConnections: Infinity,
    },
    transports: [
      tcp(),
      webSockets(),
      circuitRelayTransport({})
    ],
    streamMuxers: [
      yamux(),
      mplex()
    ],
    connectionEncrypters: [
      noise(),
    ],
    peerDiscovery: [
      bootstrap({
        list: bootstrappers
      }),
      mdns(),
    ],
    services: {
      dht: kadDHT({
        clientMode: false,  // Run as both client and server
        protocol: '/ipfs/kad/1.0.0'
      }),
      identify: identify(),
    },
  };

  return create(defaultsDeep(_options, defaults));
}

/**
 * Obtain this node's private key. Create it from a protobuf if possible, otherwise generate a fresh
 * one.
 */
async function obtainPrivateKey(nodeId): Promise<any> {
  let privateKey: any = null;
  if(nodeId && nodeId.privKey) {
    // Load the private key from the nodeId object
    try {
      // Convert base64pad private key string to Uint8Array
      const privKeyBytes = Uint8Array.from(Buffer.from(nodeId.privKey.trim(), 'base64'));
      privateKey = await keys.privateKeyFromProtobuf(privKeyBytes);
      const id = await peerIdFromPrivateKey(privateKey);
      debug(`Loaded id from file: ${id.toString()}`);
    } catch (err) {
      error(`Error creating private key from protobuf: ${err}`);
      throw err;
    }
  } else {
    // Otherwise create a fresh key pair
    try {
      debug("Creating new key pair...");
      privateKey = await keys.generateKeyPair('Ed25519');
      const id = await peerIdFromPrivateKey(privateKey);
      debug(`Created new id: ${id.toString()}`);
    } catch (err) {
      error(`Error creating key pair: ${err}`);
      throw err;
    }
  }

  return privateKey;
}

/**
 * Checks that the event queue does not get blocked. The check is scheduled to run in `period`
 * millisecond intervals. If it takes much longer than that before the check runs, this is reported,
 * since it indicates blocking.
 */
function setupBlockingHealthChecker(period: number) {
    let lastHealth: number = Date.now();
    let healthCounter = 0;
    let healthThreshold = Math.max(period * 1.25 , period + 50);
    // AA: 2020-02-10;
    // The event queue always has a fair bit of latency, so we adjust for
    // the minimal expected latency here; the constant of 50 is an
    // empirically derived value, but needs to be critically reevaluated
    // as the system evolves

    function checkBlocking() {
      let now = Date.now()
      // check and report if it has been too long since the last health check
      // this could indicate that something is the event queue
      if(now - lastHealth > healthThreshold) {
        debug(`Potential blocking issue`);
        debug(`Health check ${healthCounter} took this long ${now - lastHealth}`);
      }
      lastHealth = now;
      healthCounter++;

      // Run the check periodically
      setTimeout(checkBlocking, period);
    }
    checkBlocking();
}

// -------------------------------------------------------------------------------------------------
// SHUTDOWN

/**
 * Shut down the P2P layer
 */
export async function stop(): Promise<void> {
  await _node.stop();
}

// -------------------------------------------------------------------------------------------------
// DIAL

/**
 * Dial the node `id` using the Troupe protocol.
 */
function dial(id: PeerId): Promise<Stream> {
  // Attempt counter
  let attempt = 0;

  // Maximum number of attempts prior to giving up.
  const maxAttempts = 10;

  // Initial timeout, if something failed (2s).
  let timeout = 2000;

  // Exponential backoff factor for `timeout`.
  const backoff = 2;

  return new Promise<Stream>((resolve, reject) => {
    async function tryDialing() {
      try {
        // Add addresses to the peerStore
        await getPeerInfo(id);

        // Dial using the Troupe protocol
        debug(`Trying to dial ${id}, attempt number ${attempt}`);
        const stream: Stream = await _node.dialProtocol(id, PROTOCOL);
        debug("Dial successful");

        // Handle inputs and outputs
        setupConnection(id, stream);

        resolve(stream);
      } catch (err) {
        processExpectedNetworkErrors (err, "dial");

        // If the error is suppressed we move on to trying again with exponential backoff.
        if(attempt <= maxAttempts) {
          debug(`Dial failed, we retry in ${timeout/1000} seconds`);
          debug(err);
          setTimeout(tryDialing, timeout);
          attempt += 1;
          timeout *= backoff;
        } else {
          error(`Giving up on dialing ${id}: ${err}`);
          reject(err);
        }
      }
    }
    tryDialing();
  });
}

/**
 * Tries to find and add addresses to use for a node.
 *
 * Checks the `knownNodes` from config, the peerStore, peerRouting and using a relay.
 */
async function getPeerInfo(id: PeerId): Promise<void> {
  debug(`Checking whether node is already known`);

  // Check whether the node is known in `config`
  for(let ni of knownNodes) {
    if(ni.nodeid == id.toString()) {
      // Found a known node!
      await _node.peerStore.merge(id, {
        multiaddrs: [
          multiaddr(`${ni.ip}`)
        ]
      });
      debug(`Node ${ni.nodeid} will be contacted directly via IP: ${ni.ip}`);
      return;
    }
  }

  let usePeerRouting = true;

  // Check whether the node is known from previously and has an address
  if(await _node.peerStore.has(id)) {
    try {
      let foundPeer = await _node.peerStore.get(id);
      if(foundPeer.addresses.length != 0) {
        debug("Peer info is in the store");
        usePeerRouting = false;
      }
    } catch (err) {
      error(`Error in getPeerInfo / peerStore.get: ${err}`);
      throw err;
    }
  }

  if(usePeerRouting) {
    // The node is not known or has no address.
    debug("The node is not known; using peerRouting");
    await getPeerInfoWithPeerRouting(id);
  }

  // TODO (2025-12-11; SS): Move into `relay.mts` as a `getPeerInfoViaRelay`?
  if(relayId) {
    // Try to contact the node through a relay. To use several relays, cycle through them and add
    // them all
    debug(`Adding circuit relay address for ${id}: /p2p/${relayId}/p2p-circuit/p2p/${id.toString()}`);
    await _node.peerStore.merge(id, {
      multiaddrs: [
        multiaddr(`/p2p/${relayId}/p2p-circuit/p2p/${id.toString()}`)
      ]
    });
  }
}

/**
 * Tries to find an address to use for a node through peerRouting. Tries six times, then gives up.
 */
async function getPeerInfoWithPeerRouting(id: PeerId) : Promise<void> {
  const maxAttempts = 6;

  return new Promise ((resolve, _) => {
    let n_attempts = 0;
    async function tryFindPeer() {
      try {
        // Try to find the node, but only spend 1 second on it
        debug(`Calling peerRouting.findPeer ${id}`);
        const peerInfo = await _node.peerRouting.findPeer(id, {signal : AbortSignal.timeout(2000)});
        debug("findPeer returned");

        // Add the found address
        await _node.peerStore.merge(id, {
          multiaddrs:
            peerInfo.multiaddrs
        });
        debug("Added multiaddr to store");

        resolve();
      } catch (err) {
        debug(`tryFindPeer exception`);

        if(err instanceof AggregateError) {
          for(let e of err.errors) {
            debug(`Find peer error with code: ${e}, ${e.code}`);
          }
        } else {
          debug(`Find peer error: ${err.toString()}`);
        }

        // Increase the attempts used (only if the node is connected to the network)
        if(nPeers() > 0) {
          n_attempts++;
        }
        // Give up if this was the last attempts.
        if(maxAttempts <= n_attempts) {
          debug(`Giving up on peerRouting`);
          resolve();
        } else {
          debug(`tryFindPeer: attempt ${n_attempts} failed with ${nPeers()} nodes connected`);
          setTimeout(tryFindPeer, 500);
        }
      }
    }
    tryFindPeer();
  });
}

/**
 * Returns how many peers we have a connection to.
 */
function nPeers(): number {
  return _node.getPeers().length;
}

// -------------------------------------------------------------------------------------------------
// CONNECTION SET-UP

/**
 * Sets up the connection with a new peer with `peerId`.
 *
 * This ensures that messages that are sent and received are marshalled correctly and passes any
 * input to the input handler.
 */
function setupConnection(peerId: PeerId, stream: Stream): void {
  debug(`setupConnection with ${peerId}`);
  const p = pushable({ objectMode : true });

  // Setup the pipe to send and receive messages
  pipe (p,
        (source) => map(source, (json) => JSON.stringify(json)),
        (source) => map(source, (string : string) => uint8ArrayFromString(string, 'utf8')),
        (source) => lp.encode(source),
        stream,
        (source) => lp.decode(source),
        (source) => map(source, (buf) => uint8ArrayToString(buf.subarray())),
        (source) => map(source, (string : string) => JSON.parse(string)),
        async (source) => {
          try {
            for await (const message of source) {
              // Send any input to the input handler
              inputHandler(peerId, message);
            }
          } catch (err) {
            processExpectedNetworkErrors(err, "setupConnection/pipe");
          }

          // Hangs up when the connection closes
          debug(`Hanging up connection to ${peerId}`);
          try {
            await _node.hangUp(peerId);
          } catch (err) {
            processExpectedNetworkErrors(err, "setupConnection/hang-up");
          }

          // Resends any unacknowledged WhereIs and Spawn requests for this peer
          reissueUnacknowledged(peerId.toString());
        }
  );

  // Storing a reference to the pushable on the stream. We rely on the p2p library to keep track of
  // streams
  (stream as any).p = p;
  debug(`Connection set up with ${peerId}`);
}

/**
 * Handles the different input types by parsing them along to the runtime when necessary.
 */
async function inputHandler(peerId: PeerId, input: Message) {
  debug("Input handler");
  switch (input.messageType) {
    case (MessageType.Spawn): {
      // Check if spawning is disallowed; drop the message if so.
      if(!_rtHandlers[MessageType.Spawn]) { return; }

      debug("Received Spawn");

      if(receivedSpawnNonces[input.spawnNonce]) {
        // This is an already seen spawn request. Look up the reply and resend without spawning
        // again
        debug("This spawn was already received; replying again without spawning");
        let cachedAnswer = receivedSpawnNonces[input.spawnNonce];

        // Reply with SpawnReply and return
        pushWrap(peerId, {
          messageType: MessageType.SpawnReply,
          spawnNonce: input.spawnNonce,
          message: cachedAnswer
        });
        return;
      }

      // Inform the runtime
      const runtimeAnswer = await _rtHandlers[MessageType.Spawn](input.message, peerId.toString());

      // Reply with SpawnReply
      pushWrap(peerId, {
        messageType: MessageType.SpawnReply,
        spawnNonce: input.spawnNonce,
        message: runtimeAnswer
      });
      debug("Spawn replied");

      // Save the nonce and the answer for 10 minutes in case we get the same request again
      receivedSpawnNonces[input.spawnNonce] = runtimeAnswer;
      setTimeout(() => delete receivedSpawnNonces[input.spawnNonce], 600000);
      break;
    }

    case (MessageType.SpawnReply): {
      debug("Received Spawn OK");
      // Find the call-back and give the message; otherwise report an error
      const _cb = _spawnNonces[input.spawnNonce];
      if(_cb) {
        delete _spawnNonces[input.spawnNonce]; // Clean-up
        _cb(null, input.message); // null means no errors
      } else {
        error("Cannot find Spawn callback");
      }
      break;
    }

    case (MessageType.SendByValue): {
      debug(`Received SendByValue from ${peerId}`);
      // Pass the message to the runtime
      _rtHandlers[MessageType.SendByValue](input.pid, input.message, peerId.toString());
      break;
    }

    case (MessageType.WhereIs): {
      debug("Received WhereIs");
      // Get the runtime to find the peer
      const runtimeAnswer = await _rtHandlers[MessageType.WhereIs](input.message, peerId.toString());

      // Reply with WhereIsReply
      pushWrap(peerId, {
        messageType: MessageType.WhereIsReply,
        whereisNonce : input.whereisNonce,
        message : runtimeAnswer
      });

      debug("WhereIs replied");
      break;
    }

    case (MessageType.WhereIsReply): {
      debug("Received WhereIsReply");
      // Find the call-back and give the message Otherwise report an error
      const _cbw = _whereisNonces[input.whereisNonce];
      if(_cbw) {
        delete _whereisNonces [input.whereisNonce]; // Clean-up
        _cbw(null, input.message); // null means no errors
      } else {
        error("Cannot find WhereIs callback");
      }
      break;
    }

    default: {
      debug(`received data ${(input as any).toString('utf8').replace('\n', '')}`);
      break;
    }
  }
}

// -------------------------------------------------------------------------------------------------
// SEND

/**
 * Handles a send (by value) request to peer `id`. Just pushes a Send message.
 */
export async function sendByValue(id: string, procId: string, obj: any) {
  debug(`sendp2p`);

  pushWrap(peerIdFromString(id), {
    messageType: MessageType.SendByValue,
    pid: procId,
    message: obj
  });
}

/**
 * Pushes `data` to a connection with `id`. First finds a pushable on a connection with `id`, then
 * pushes the data. Continues until the data is successfully pushed.
 */
async function pushWrap(id: PeerId, data: Message) {
  while(true) {
    debug(`pushWrap`);
    const p = await getPushable(id);

    try {
      if(p) {
        // A pushable has been found, data can be pushed
        debug(`Stream obtained; pushing`);
        await p.push(data);
        debug(`Data pushed into the stream`);
        break;
      } else {
        debug("Pushable found was null; re-trying");
      }
    } catch (err) {
      // The pushable we have used is no good for whatever reason; most likely there are networking
      // issues. We report the errors and redial
      processExpectedNetworkErrors(err, "pushWrap");
    }
  }
}

/**
 * Finds a pushable to node `id` by checking all existing connections with the node. If no existing
 * pushable is found, then dials the node.
 */
async function getPushable(id: PeerId) {
  debug("getPushable");
  let connections = _node.getConnections(id);
  let needsToDial = true;
  let p = null;

  // Runs through all existing connections with the peer
  // and checks whether their streams have a pushable
  for(const connection of connections) {
    let streams = connection.streams;
    for(const stream of streams) {
      p = (stream as any).p;
      needsToDial = (p == undefined);

      if(!needsToDial) {
        debug("Found existing pushable");
        return p;
      }
    }
  }

  // If no pushable was found, dial the peer
  if(needsToDial) {
    debug("Needs to dial");
    const stream  = await dial(id);

    // If the dial fails, the stream is null
    //
    // TODO (2025-12-11; SS): Looking at `dial(...)` it is either `Stream` or it passes the error
    //                        into the `reject(...)` case which would result in throwing an error?
    if(stream) {
      debug("Dialed to obtain stream");
      p = (stream as any).p;
    } else {
      debug("Could not obtain stream through dial");
    }
  }

  return p;
}

// -------------------------------------------------------------------------------------------------
// WhereIs / Spawn

/** Stores call-backs for WhereIs requests. */
let _whereisNonces: { [nonce in string]: (err: any, res: any) => void } = {};

/** Stores call-backs for Spawn requests. */
let _spawnNonces: { [nonce in string]: (err: any, res: any) => void } = {};

/**
 * Stores received Spawn nonces and the runtime answer for their reply. These are stored for 10
 * minutes in case the SpawnReply disappeared
 */
let receivedSpawnNonces: { [nonce in string]: any } = {};

/** Keeps track of unacknowledged WhereIs and Spawn requests. */
let _unacknowledged: { [id in string]: { [nonce in string]: () => void } } = {};

/**
 * Handles a where-is request of peer `id`. Creates a nonce which gives the result in the where-is
 * table. Also sets the request as unacknowledged. Then pushes a WhereIs message.
 */
export async function whereis(id: string, data: any) {
  debug("whereisp2p");

  // Create a nonce
  let whereisNonce = uuidv4();

  function sendMessage() {
    let peerId = peerIdFromString(id);
    pushWrap(peerId, {
      messageType : MessageType.WhereIs,
      whereisNonce : whereisNonce,
      message : data
    });
  }

  // Set the WhereIs request as unacknowledged
  addUnacknowledged(id.toString(), whereisNonce, sendMessage);

  return new Promise((resolve, reject) => {
    // Return the error or result when an answer comes in
    _whereisNonces[whereisNonce] = (err, result) => {
      if(err) {
        reject(err);
      } else {
        // Only remove the unacknowledged status if the request succeeds
        removeUnacknowledged(id.toString(), whereisNonce);
        resolve(result);
      }
    }

    // Push the WhereIs message
    debug("Pushing WhereIs message");
    sendMessage();
  });
}

/**
 * Handles a spawn request at peer `id`. Creates a nonce which gives the result in the spawn table.
 * Then pushes a Spawn message to the receiving peer.
 */
export async function spawn(id: string, data: any) {
  debug("spawnp2p");

  // Create a nonce
  const spawnNonce = uuidv4();

  function sendMessage() {
    let peerId = peerIdFromString(id);
    pushWrap(peerId, {
      messageType : MessageType.Spawn,
      spawnNonce : spawnNonce,
      message : data
    });
  }

  // Set the Spawn request as unacknowledged
  addUnacknowledged(id.toString(), spawnNonce, sendMessage);

  return new Promise ((resolve, reject) => {
    // Return the error or result when an answer comes in
    _spawnNonces[spawnNonce] = (err, result) => {
      if(err) {
        reject(err);
      } else {
        // Only remove the unacknowledged status if the request succeeds
        removeUnacknowledged(id.toString(), spawnNonce);
        resolve(result);
      }
    };

    // Push the Spawn message
    debug("Pushing Spawn message");
    sendMessage();
  });
}

/**
 * Add the function `f` as unacknowledged *WhereIs* or *Spawn* request for `id` with nonce `uuid`.
 */
function addUnacknowledged(id: string, uuid: string, f: () => void) {
  if(!_unacknowledged[id]) {
    _unacknowledged[id] = {};
  }
  _unacknowledged[id][uuid] = f;
}

/**
 * Remove the unacknowledged *WhereIs* or *Spawn* request for `id` with nonce `uuid`.
 */
function removeUnacknowledged(id: string, uuid: string) {
  delete _unacknowledged[id][uuid];
}

/**
 * Rerun all unacknowledged *WhereIs* or *Spawn* requests for `id`.
 */
function reissueUnacknowledged(id: string) {
  for(let uuid in _unacknowledged[id]) {
    setImmediate(_unacknowledged[id][uuid]);
  }
}
