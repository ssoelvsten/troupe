import * as fs from 'node:fs';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid'
import AggregateError from 'aggregate-error';
import { unitLVal } from './base/unitLVal.mjs'
import { mkAuthority, mkProcessID } from './base/rawUtil.mjs';
import { Scheduler, ThreadType } from './Scheduler.mjs'
import { MailboxProcessor } from './MailboxProcessor.mjs'
import { RuntimeInterface } from './RuntimeInterface.mjs'
import { LVal, MbVal } from './base/LVal.mjs'
import * as LValUtil from './base/lvalUtil.mjs';
import { UserRuntime } from './UserRuntime.mjs'
import * as levels from './Level.mjs'
const { flowsTo, lub, glb } = levels
import * as DS from './deserialize.mjs'
import * as p2p from './p2p/p2p.mjs'
import { MessageType } from './p2p/Message.mjs'
import { RuntimeHandlers } from './p2p/RuntimeHandlers.mjs'
import { closeReadline } from './builtins/stdio.mjs';
import { __theRegister } from './builtins/whereis.mjs';
import { assertIsFunction } from './Asserts.mjs'
import runId from './runId.mjs'
import { __nodeManager } from './NodeManager.mjs'
import { setRuntimeObject } from './SysState.mjs';
import { initTrustMap, nodeTrustLevel, _trustMap } from './TrustManager.mjs';
import { serialize } from './serialize.mjs';
import { Thread } from './Thread.mjs';
import { Console } from 'node:console'
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
import { configureColors, isColorEnabled } from './colorConfig.mjs';
import { mkLogger } from './logger.mjs'
import { RawRecord } from './base/RawRecord.mjs';
import { level } from 'winston';
import { RawProcessID } from './base/RawProcessID.mjs';
import { sendCache, recvCache, initP2PCaches } from './p2pCache.mjs';
import isEqual from './base/isEqual.mjs';
import { LocalObject } from './base/LocalObject.mjs';

const readFile = fs.promises.readFile
const argv = getCliArgs();

// Configure colors before any chalk or logger usage
configureColors();

const logLevel = argv[TroupeCliArg.Debug] ? 'debug': 'info'
const logger = mkLogger('RTM', logLevel);

let __p2pRunning = false;

const rt_xconsole =
      new Console({ stdout: process.stdout
                  , stderr: process.stderr
                  , colorMode: isColorEnabled()
                 });

/** Returns the current thread */
function $t():Thread { return __sched.getCurrentThread() };

// --------------------------------------------------

async function spawnAtNode(nodeid, f) {
  logger.debug(`* rt spawnAtNode  ${nodeid}`);
  let node = __nodeManager.getNode(nodeid.val);

  // TODO (AA; 2018-09-24): do the information flow check
  //
  // TODO (SS; 2025-12-01): type check `f` to be a closure

  let { data, level } = serialize(f, lub($t().pc, nodeid.lev));

  let trustLevel = nodeTrustLevel(node.nodeId);
  let theThread = $t();

  if (!flowsTo(level, trustLevel)) {
    theThread.throwInSuspended("Illegal trust flow when spawning on a remote node\n" +
      ` | the trust level of the recepient node: ${trustLevel.stringRep()}\n` +
      ` | the level of the information in spawn: ${level.stringRep()}`);
     __sched.scheduleThread(theThread);
     __sched.resumeLoopAsync();
     return;
  }

  // 0. we assume that the node is different from the local node
  // 1. we make a connection to the remote node
  // 2. we send the serialized version of f
  // 3. we wait for the reply (should be a pid)
  // 4. we return the obtained pid

  try {
    let body1 = await p2p.spawn(node.nodeId, data);
    let body = await DS.deserialize(nodeTrustLevel(node.nodeId), body1);
    let pid = mkProcessID(body.val.uuid, body.val.pid, body.val.node);
    theThread.returnSuspended(new LVal(pid, body.lev));

    __sched.scheduleThread(theThread);
    __sched.resumeLoopAsync();

  } catch (err) {
    logger.error("error spawning remotely; this blocks current thread")
    if (err instanceof AggregateError) {
      for (let ie in err) {
        logger.error(`${ie}`);
      }
    } else {
      logger.error(`${err}`);
    }
  }
}

/**
 * This function is invoked when someone spawns a thread on our node.
 *
 * Since it is a new thread that is independent of the other ones already
 * running, the *pc* and *bl* of this new thread only depends on the received
 * value, not the one currently running (if any).
 *
 * @param {*} jsonObj
 *    The payload function.
 *
 * @param {*} fromNode
 *    The identity of the node that initiates the spawning.
 *
 * @return
 *    The newly generated process id. This is needed to communicate the new pid
 *    to the spawner.
 */
async function spawnFromRemote(jsonObj, fromNode) {
  logger.debug("spawn from remote");

  // Deserialize the given function.
  //
  // TODO (SS; 2025-12-01): check that the deserialized value actually is a
  //                        Troupe closure.
  const lf = await DS.deserialize(nodeTrustLevel(fromNode), jsonObj);

  // Schedule `lf` as a new thread and start the scheduler (if it was idle).
  const tid =
    __sched.scheduleNewThread(
      lf.val
      , unitLVal
      , lf.lev
      , lf.lev
    );
  __sched.resumeLoopAsync();

  // The returned value has to be serialized since it is sent over p2p
  return serialize(tid, levels.BOT).data;
}


/**
 * This function is called when someone sends us a message by value.
 *
 * @param {*} pid
 *    The process id of the sender
 * @param {*} jsonObj
 *    The payload
 * @param {*} fromNode
 *    The node identity of the sender node
 */
async function receiveValueFromRemote(pid: string, jsonObj: any, fromNode: string) {
  // Deserialize the data to runtime values, either directly or via the
  // `troupec` compiler
  //
  // TODO (2025-12-12; SS): prior to deserialization, find all hash references
  //                        in `jsonObj`. The ones that are already known should
  //                        be copied into an intermediate `Map<string, LVal>`
  //                        save them from garbage collections in the cache.
  //                        Unknown values are requested from `fromNode`.
  logger.debug(`* rt receiveFromRemote *  ${JSON.stringify(jsonObj)}`);
  const data = await DS.deserialize(nodeTrustLevel(fromNode), jsonObj);
  logger.debug(`* rt receiveFromRemote *  ${fromNode} ${data.stringRep()}`);

  // TODO (2018-07-23; AA): do we need to do some more reasoning about the
  //                        level of the fromNode?
  //
  // TODO (2025-12-12; SS): since this handler lives outside of the runtime, we
  //                        should not depend on the current thread `$t()`!

  // If successful, add the deserialized message to the mailbox of said process.
  const fromNodeId = $t().mkVal(fromNode);
  const toPid = new LVal(mkProcessID(runId, pid, __nodeManager.getLocalNode()), data.lev);
  __theMailbox.addMessage(fromNodeId, toPid, data.val, data.lev);
  __sched.resumeLoopAsync();
}

/**
 * This function is called when someone sends us a message by hash-reference.
 *
 * @todo This should be merged with `receiveValueFromRemote` (see `p2p/Message.mts`) for more
 *       details.
 */
async function receiveHashFromRemote(pid: string, jsonObj1: any, fromNode: string) {
  const fromNodeLevel = nodeTrustLevel(fromNode);
  const hash = await DS.deserialize(fromNodeLevel, jsonObj1);
  if (!LValUtil.isString(hash)) {
    logger.error("hash reference with non-string payload; dropping message.\n" +
                 ` | ${hash.stringRep()}`);
    return;
  }

  const toPid = new LVal(mkProcessID(runId, pid, __nodeManager.getLocalNode()), hash.lev);
  const fromNodeId = new LVal(fromNode, hash.lev);

  __sched.resumeLoopAsync();
  const cached: any /* SerializedValue */ = await recvCache.get(hash, fromNodeLevel);

  if (cached) {
    // HACK: Currently, `DS.deserialize` is taking care of two things at once: (1) creating a
    //       Troupe runtime value and (2) downgrade it to the trustLevel of `fromNodeLevel`.
    //
    //       Hence, we will have to deserialize the value anew instead of merely downgrading a
    //       previously deserialized value.
    const data: MbVal = await DS.deserialize(fromNodeLevel, cached);
    __theMailbox.addMessage(fromNodeId, toPid, data.val, hash.lev);
    __sched.resumeLoopAsync();
    return;
  }

  try {
    const jsonObj2 = await p2p.requestHash(fromNode, jsonObj1);
    const data: MbVal = await DS.deserialize(fromNodeLevel, jsonObj2);
    const dataHash = LValUtil.hash(data.val);

    if (!isEqual(dataHash, hash.val)) {
      logger.error("mismatching hash for unknown value; dropping message.");
      return;
    }
    recvCache.set(hash, jsonObj2);

    // If successful, add the deserialized message to the mailbox of said process.
    __theMailbox.addMessage(fromNodeId, toPid, data.val, hash.lev);
    __sched.resumeLoopAsync();
  } catch (err) {
    logger.error("error fetching unknown value associated with hash; dropping message.");
    if (err instanceof AggregateError) {
      for (let ie in err) { logger.error(`${ie}`); }
    } else {
      logger.error(`${err}`);
    }
  }
}

/**
 * Sends the provided message to a remote process, first doing the information
 * flow check that the remote process is not going to violate our trust
 * assumptions.
 *
 * @param {*} toPid   The pid of the remote process
 * @param {*} message The data to send
 *
 */
function sendByValueToRemote(toPid: LVal<RawProcessID>, message: LVal): void {
  const node = toPid.val.node.nodeId;
  const pid = toPid.val.pid;

  const { data, level } = serialize(new MbVal(message, $t().pc), $t().pc);

  const trustLevel = nodeTrustLevel(node);

  if (!flowsTo(level, trustLevel)) {
    $t().threadError("Illegal trust flow when sending information to a remote node\n" +
                    ` | the trust level of the recipient node: ${trustLevel.stringRep()}\n` +
                    ` | the level of the information to send:  ${level.stringRep()}`);
    return;
  }

  p2p.sendByValue(node, pid, data);
}

/**
 * Sends the provided message to a local process. Since the local machine is fully.
 * trusted, this includes no checks.
 *
 * @param {*} toPid   The pid of the remote process
 * @param {*} message The data to send
 */
function sendByValueToLocal(toPid: LVal<RawProcessID>, message: LVal): void {
  const nodeId = $t().mkVal(__nodeManager.getNodeId());
  __theMailbox.addMessage(nodeId, toPid, message, $t().pc);
}

/**
 * Sends the hash of the provided message to a remote process and stores (if
 * necessary) the message in the send store.,
 *
 * @todo This might be merged with `sendByValueToRemote` (see `p2p/Message.mts`)
 *       by enabling/disabling hashing as part of serialization?
 */
function sendByHashToRemote(toPid: LVal<RawProcessID>, message: LVal): void {
  const node = toPid.val.node.nodeId;
  const pid = toPid.val.pid;

  // TODO (aggregate types): Include (deep) level annotations as part of the hash.
  //
  // Use `LVal.copy` to raise its access level to `$t().pc` and not merely `message`.
  const hash = LVal.copy(LValUtil.hash(message), $t().pc);
  const { data, level } = serialize(hash, $t().pc);

  const trustLevel = nodeTrustLevel(node);
  if (!flowsTo(level, trustLevel)) {
    $t().threadError("Illegal trust flow when sending information to a remote node\n" +
                    ` | the trust level of the recepient node: ${trustLevel.stringRep()}\n` +
                    ` | the level of the information to send:  ${level.stringRep()}`);
    return;
  }

  sendCache.set(hash, serialize(new MbVal(message), $t().pc));
  p2p.sendByHash(node, pid, data);
}

/**
 * Handler for request messages to access a value stored in the `sendCache`.
 */
async function requestHashFromRemote(jsonObj: any, fromNode: string): Promise<any> {
  const fromNodeLevel = nodeTrustLevel(fromNode);
  const hash = await DS.deserialize(fromNodeLevel, jsonObj);
  if (!LValUtil.isString(hash)) {
    logger.error("hash request with incorrect payload; dropping message.");
    return;
  }

  const serializedMessage: any /* SerializedValue */ = await sendCache.get(hash);
  if (!serializedMessage) {
    logger.error("Failing request for sendCache::get(...)\n" +
                 ` | the trust level of the recipient node: ${fromNodeLevel.stringRep()}`);
    return undefined;
  }

  const { data, level } = serializedMessage;

  if (!flowsTo(level, fromNodeLevel)) {
    logger.error("Illegal trust flow of value from sendCache::get(...)\n" +
                 ` | the trust level of the recipient node: ${fromNodeLevel.stringRep()}\n` +
                 ` | the level of the key requested: ${hash.lev.stringRep()}\n` +
                 ` | the level of the value to send: ${level.stringRep()}`);
    return undefined;
  }

  return data;
}

async function whereisFromRemote(k, fromNode) {
  __sched.resumeLoopAsync()

  // Is `k` is unknown?
  if (!__theRegister[k]) { return undefined; }

  const { data, level } = serialize(__theRegister[k], levels.BOT);

  // Is `fromNode` not allowed to see `k`?
  const trustLevel = nodeTrustLevel(fromNode);
  if (!flowsTo(level, trustLevel)) { return undefined; }

  // Provide the identity of `k`.
  return data;
}

// TODO: Clean up the mess below...
let __sched: Scheduler
let __theMailbox: MailboxProcessor
let __userRuntime: any
let __service:any = {}

class RuntimeObject implements RuntimeInterface {
  xconsole    = rt_xconsole;

  get $service () {
    return __service;
  }

  get $t() {
    return $t();
  }

  get __sched() {
    return __sched;
  }

  get __mbox() {
    return __theMailbox;
  }

  get __userRuntime() {
    return __userRuntime;
  }

  constructor() {
    __sched = new Scheduler(this);
    __theMailbox = new MailboxProcessor(this);
    __userRuntime = new UserRuntime(this);
  }

  ret (arg) {
    return $t().returnImmediateLValue(arg);
  }

  debug (s) {
    function formatToN(s, n) {
      if (s.length < n) {
        let j = s.length;
        for (; j < n; j++) {
          s = s + " ";
        }
      }
      return s;
    }

    const tid = $t().tidErrorStringRep();
    const pc = $t().pc.stringRep();
    const bl = $t().bl.stringRep();
    const handler_state = $t().handlerState.toString();
    rt_xconsole.log(
      chalk.red(formatToN("PID:" + tid, 50)),
      chalk.red(formatToN("PC:" + pc, 20)),
      chalk.red(formatToN("BL:" + bl, 20)),
      chalk.red(formatToN("HN" + handler_state, 20)),
      chalk.red(formatToN("_sp:" + $t()._sp, 20)),
      s
    );
  }

  async spawnAtNode(nodeId, fn) {
    return await spawnAtNode(nodeId, fn);
  }

  rt_mkuuid() {
    const pid = uuidv4();
    const uuidval = $t().mkVal(pid);
    return uuidval;
  }

  mkLabel(x) {
    return new LVal(levels.fromSingleTag(x), $t().pc);
  }

  /**
   * @todo When merging `sendByValue` and `sendByHash` messages, merge this
   *       with the function below and rename them back to `send`.
   */
  sendByValue(toPid: LVal<RawProcessID>, message: LVal) {
    const isLocalPid = toPid.val.uuid.toString() == runId.toString();

    if (isLocalPid) {
      sendByValueToLocal(toPid, message);
    } else {
      logger.debug ("* rt rt_send remote *"/*, recipientPid, message*/);
      sendByValueToRemote(toPid, message);
    }
  }

  /**
   * @todo When merging `sendByValue` and `sendByHash` messages, rename this
   *       to `send` or similar to better convey that hashing may only be
   *       applied partially.
   *
   *       Instead, add a boolean flag here whether to disable hashing.
   */
  sendByHash(toPid: LVal<RawProcessID>, message: LVal) {
    const isLocalPid = toPid.val.uuid.toString() == runId.toString();

    if (isLocalPid) {
      sendByValueToLocal(toPid, message);
    } else {
      sendByHashToRemote(toPid, message);
    }
  }

  async cleanup() {
    closeReadline()
    DS.stopCompiler();
    if (__p2pRunning) {
      try {
        logger.debug("stopping p2p")
        await p2p.stop()
        logger.debug("p2p stop OK")
      } catch (err) {
        logger.debug(`p2p stop failed ${err}`)
      }
    }
  }

  persist(obj, path) {
    let jsonObj = serialize(obj, $t().pc).data;
    fs.writeFileSync(path, JSON.stringify(jsonObj));
  }
}

const __rtObj = new RuntimeObject();
DS.setRuntimeObj(__rtObj.__userRuntime);
setRuntimeObject(__rtObj)

// HACK (2020-02-09; AA)
function bulletProofSigint() {
  process.removeAllListeners("SIGINT");
  process.on('SIGINT', () => {
    logger.debug("SIGINT");
    (async () => {
      await __rtObj.cleanup()
      process.exit(0);
    })()
  })
}
bulletProofSigint();

// TODO (2025-12-09; SS): Move all of the service code into a separate file.
async function loadServiceCode() {
  let input = await fs.promises.readFile(process.env.TROUPE + '/trp-rt/out/service.js', 'utf8')
  let S: any = new Function('rt', input)
  let service = new S(__userRuntime);

  await __userRuntime.linkLibs(service)

  __userRuntime.setLibloadMode()
  let table = service.export({__dataLevel:levels.BOT}).val.toArray()
  __userRuntime.setNormalMode()

  for (let i = 0; i < table.length; i++) {
    let name = table[i].val[0].val
    let ff = table[i].val[1].val
    __service[name] = ff
  }
}

// TODO (2025-12-09; SS): Move all network-to-runtime logic into a separate file.
async function getNetworkPeerId() {
  const localOnly = argv[TroupeCliArg.LocalOnly] || argv[TroupeCliArg.Persist];

  if (localOnly) {
    logger.info("Skipping network creation. Observe that all external IO operations will yield a runtime error.");
    if (argv[TroupeCliArg.Persist]) {
      logger.info("Running with persist flag.");
    }
    return null;
  }

  const rtHandlers = {
    [MessageType.Spawn]:       argv[TroupeCliArg.RSpawn] ? spawnFromRemote : undefined,
    [MessageType.SendByValue]: receiveValueFromRemote,
    [MessageType.SendByHash]:  receiveHashFromRemote,
    [MessageType.RequestHash]: requestHashFromRemote,
    [MessageType.WhereIs]:     whereisFromRemote,
  };

  return await p2p.start(rtHandlers);
}

// TODO (2025-12-09; SS): Move into `troupe.mts`. Some of this should be
//                        moved together with `loadServiceCode()` and other
//                        parts together with `getNetworkPeerId()`.
export async function start(f) {
  // Set up p2p network
  await initTrustMap();

  let peerid = await getNetworkPeerId();

  if (peerid) {
    __p2pRunning = true;
    logger.debug("network ready");
  } else {
    logger.debug("network not initialized");
  }

  __nodeManager.setLocalPeerId(peerid);

  // ---------------------------------------------------------------------------
  // Initialise 'scheduler' for Troupe code execution
  __sched.initScheduler(__nodeManager.getLocalNode() , !__p2pRunning);

  // ---------------------------------------------------------------------------
  // Set up 'service' thread

  // HACK: Despite the fact that service code is only spawned, if `__p2pRunning`,
  //       we need to populate the runtime.$service object.
  //
  // TODO: Instead, treat these fields as nullable in `builtins/receive.mts` and
  //       elsewhere. Best is to also put this into the typesystem.
  await loadServiceCode();

  if (__p2pRunning) {
    const serviceAuthority = new LVal(mkAuthority(levels.ROOT), levels.BOT);

    let service_arg =
      new LVal ( new RawRecord([ ["authority", serviceAuthority],
                              ["options", unitLVal]]),
              levels.BOT);
    __sched.scheduleNewThread(__service['service']
          , service_arg
          , levels.TOP
          , levels.BOT
          , ThreadType.System);
  }

  // Set up 'cache' threads
  await initP2PCaches(__userRuntime, __sched);

  // Set up 'main' thread
  const mainAuthority = new LVal(mkAuthority(levels.ROOT), levels.BOT);

  await __userRuntime.linkLibs(f);

  const onTerminate = (retVal: LVal) => {
    console.log(`>>> Main thread finished with value: ${retVal.stringRep()}`);
    if (argv[TroupeCliArg.Persist]) {
      this.rtObj.persist(retVal, argv[TroupeCliArg.Persist])
      console.log("Saved the result value in file", argv[TroupeCliArg.Persist])
    }
  };

  __sched.scheduleNewThread(
    () => f.main({__dataLevel:levels.BOT})
    , mainAuthority
    , levels.BOT
    , levels.BOT
    , ThreadType.Main
    , onTerminate
  );

  // ---------------------------------------------------------------------------
  // Start code execution
  __sched.resumeLoopAsync();
}
