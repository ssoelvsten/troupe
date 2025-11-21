import * as fs from 'node:fs';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid'
import AggregateError from 'aggregate-error';
import { __unit } from './UnitVal.mjs'
import { Authority } from './Authority.mjs'
import { Scheduler, ThreadType } from './Scheduler.mjs'
import { MailboxProcessor } from './MailboxProcessor.mjs'
import { RuntimeInterface } from './RuntimeInterface.mjs'
import { LVal, MbVal } from './Lval.mjs'
import { ProcessID } from './process.mjs';
import { UserRuntime } from './UserRuntime.mjs'
import * as levels from './Level.mjs'
const { flowsTo, lub, glb } = levels
import * as DS from './deserialize.mjs'
import { p2p } from './p2p/p2p.mjs'
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
import { Record } from './Record.mjs';
import { level } from 'winston';

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

  // TODO (2018-09-24: AA): do the information flow check

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


  // 0. we assume that the node is different from
  //    the local node
  // 1. we make a connection to the remote node
  // 2. we send the serialized version of f
  // 3. we wait for the reply (should be a pid)
  // 4. we return the obtained pid
  //--------------------------------------------------

  try {
    let body1 = await p2p.spawnp2p(node.nodeId, data);
    let body = await DS.deserialize(nodeTrustLevel(node.nodeId), body1);
    let pid = new ProcessID(body.val.uuid, body.val.pid, body.val.node);
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

let _allowRemoteSpawn = argv[TroupeCliArg.RSpawn];
function remoteSpawnOK() {
  return _allowRemoteSpawn;
}


/**
 *
 * This function is invoked when someone spawns a thread
 * on our node.
 *
 * @param {*} jsonObj
 *    The payload function.
 *
 * @param {*} rtcb
 *    The callback to the networking runtime (e.g., p2p subsystem)
 *    that we invoke with the newly generated process id. This is
 *    needed to communicate the new pid to the spawner.
 *
 * @param {*} fromNode
 *    The identity of the node that initiates the spawning.
 */
async function spawnFromRemote(jsonObj, fromNode) {
  logger.debug("spawn from remote");
  // 2018-05-17: AA; note that this _only_ uses the lf.lev and
  // is completely independent of the current thread's pc;

  const nodeLev = nodeTrustLevel(fromNode);

  const lf = await DS.deserialize(nodeLev, jsonObj);
  const f = lf.val;
  const tid =
    __sched.scheduleNewThread(
      f
      , __unit //[f.env, __unit]
      // , f.namespace
      , lf.lev
      , lf.lev
    );

  // 2018-09-19: AA: because we need to send some info back, we have to invoke
  // serialization.

  const serObj = serialize(tid, levels.BOT).data
  __sched.resumeLoopAsync();
  return serObj;
}


/**
 * This function is called when someone sends us a message.
 *
 * @param {*} pid
 *    The process id of the sender
 * @param {*} jsonObj
 *    The payload
 * @param {*} fromNode
 *    The node identity of the sender node
 */
async function receiveFromRemote(pid, jsonObj, fromNode) {
  // Deserialize the data to runtime values, either directly or via the `troupec` compiler
  logger.debug(`* rt receiveFromRemote *  ${JSON.stringify(jsonObj)}`);
  const data = await DS.deserialize(nodeTrustLevel(fromNode), jsonObj);
  logger.debug(`* rt receiveFromRemote *  ${fromNode} ${data.stringRep()}`);

  // TODO (AA; 2018-07-23): do we need to do some more reasoning about the level of the fromNode?

  // If successful, add the deserialized message to the mailbox of said process.
  const fromNodeId = $t().mkVal(fromNode);
  const toPid = new LVal(new ProcessID(runId, pid, __nodeManager.getLocalNode()), data.lev);
  __theMailbox.addMessage(fromNodeId, toPid, data.val, data.lev);
  __sched.resumeLoopAsync();
}


/**
 * Sends the provided mesasge to a remote process, first doing the information
 * flow check that the remote process is not going to violate our trust
 * assumptions.
 *
 * @param {*} toPid   The pid of the remote process
 * @param {*} message The data to send
 *
 */
function sendMessageToRemote(toPid, message) {
  const node = toPid.node.nodeId;
  const pid = toPid.pid;

  const { data, level } = serialize(new MbVal(message, $t().pc), $t().pc);

  const trustLevel = nodeTrustLevel(node);

  if (!flowsTo(level, trustLevel)) {
    $t().threadError("Illegal trust flow when sending information to a remote node\n" +
                    ` | the trust level of the recepient node: ${trustLevel.stringRep()}\n` +
                    ` | the level of the information to send:  ${level.stringRep()}`,
                    false);
  } else {
    // we return unit to the call site at the thread level
    p2p.sendp2p(node, pid, data)
    return $t().returnImmediateLValue(__unit);
  }
}


async function whereisFromRemote(k) {
  __sched.resumeLoopAsync()
  // TODO (AA; 2018-10-20): Make use of the levels as they were
  // recorded during the registration (instead of the bottom here)
  if (__theRegister[k]) {
    return serialize(__theRegister[k], levels.BOT).data;
  }
}


// TODO (AA; 2020-05-19): consider moving these two functions somewhere else
function isLocalPid(pid) {
  return pid.uuid.toString() == runId.toString();;
}

function rt_mkuuid() {
  let pid = uuidv4();
  let uuidval = $t().mkVal(pid);
  return uuidval;
}

function rt_sendMessageNochecks(lRecipientPid, message, ret = true) {
  let recipientPid = lRecipientPid.val;

  if (isLocalPid(recipientPid)) {
    let nodeId = $t().mkVal(__nodeManager.getNodeId());
    __theMailbox.addMessage(nodeId, lRecipientPid, message, $t().pc);

    if (ret) {
      return $t().returnImmediateLValue(__unit);
    }
  } else {
    logger.debug ("* rt rt_send remote *"/*, recipientPid, message*/);
    return sendMessageToRemote(recipientPid, message)
  }
}


function rt_debug (s) {
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

function rt_mkLabel(x) {
  return new LVal(levels.fromSingleTag(x), $t().pc);
}

function rt_ret (arg) {
  return $t().returnImmediateLValue(arg);
}

// TODO: Clean up the mess below...
let __sched: Scheduler
let __theMailbox: MailboxProcessor
let __userRuntime: any
let __service:any = {}

class RuntimeObject implements RuntimeInterface {
  xconsole            = rt_xconsole;
  ret                 = rt_ret;
  debug               = rt_debug;
  spawnAtNode         = spawnAtNode;
  rt_mkuuid           = rt_mkuuid;
  mkLabel             = rt_mkLabel;
  sendMessageNoChecks = rt_sendMessageNochecks;
  cleanup             = cleanupAsync;
  persist(obj, path) {
    let jsonObj = serialize(obj, $t().pc).data;
    fs.writeFileSync(path, JSON.stringify(jsonObj));
  }

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
}

let __rtObj = new RuntimeObject();
DS.setRuntimeObj(__rtObj.__userRuntime);
setRuntimeObject(__rtObj)

async function cleanupAsync() {
  closeReadline()
  DS.stopCompiler();
  if (__p2pRunning) {
    try {
      logger.debug("stopping p2p")
      await p2p.stopp2p()
      logger.debug("p2p stop OK")
    } catch (err) {
      logger.debug(`p2p stop failed ${err}`)
    }
  }
}

// 2020-02-09; AA; ugly ugly hack
function bulletProofSigint() {
  process.removeAllListeners("SIGINT");
  process.on('SIGINT', () => {
    logger.debug("SIGINT");
    (async () => {
      await cleanupAsync()
      process.exit(0);
    })()
  })
}
bulletProofSigint();


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


async function getNetworkPeerId(rtHandlers) {
  const localOnly = argv[TroupeCliArg.LocalOnly] || argv[TroupeCliArg.Persist];

  if (localOnly) {
    logger.info("Skipping network creation. Observe that all external IO operations will yield a runtime error.");
    if (argv[TroupeCliArg.Persist]) {
      logger.info("Running with persist flag.");
    }
    return null;
  }
  return await p2p.startp2p(rtHandlers);
}


export async function start(f) {
  // Set up p2p network
  await initTrustMap();

  let peerid = await getNetworkPeerId({
    remoteSpawnOK,
    spawnFromRemote,
    receiveFromRemote,
    whereisFromRemote
  });

  if (peerid) {
    __p2pRunning = true;
    logger.debug("network ready");
  } else {
    logger.debug("network not initialized");
  }

  __nodeManager.setLocalPeerId(peerid);

  // ---------------------------------------------------------------------------
  // Initialise 'scheduler' for Troupe code execution
  __sched.initScheduler(__nodeManager.getLocalNode() , !__p2pRunning, cleanupAsync);

  // ---------------------------------------------------------------------------
  // Set up 'service' thread

  // HACK: Despite the fact that service code is only spawned, if `__p2pRunning`,
  //       we need to populate the runtime.$service object.
  //
  // TODO: Instead, treat these fields as nullable in `builtins/receive.mts` and
  //       elsewhere. Best is to also put this into the typesystem.
  await loadServiceCode();

  if (__p2pRunning) {
    const serviceAuthority = new LVal(new Authority(levels.ROOT), levels.BOT);

    let service_arg =
      new LVal ( new Record([ ["authority", serviceAuthority],
                              ["options", __unit]]),
              levels.BOT);
    __sched.scheduleNewThread(__service['service']
          , service_arg
          , levels.TOP
          , levels.BOT
          , ThreadType.System);
  }

  // Set up 'main' thread
  const mainAuthority = new LVal(new Authority(levels.ROOT), levels.BOT);

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
