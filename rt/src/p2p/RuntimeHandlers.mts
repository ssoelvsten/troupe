import { MessageType } from './Message.mjs'
import { LVal } from '../LVal.mjs'

/**
 * Handler for `SPAWN` messages.
 *
 * @returns The `LVal` to be sent back with a `SPAWNOK`.
 */
type RuntimeSpawnHandler =
  (f: any, peerId: string) => Promise<LVal>;

/**
 * Handler for `SEND` messages.
 */
type RuntimeSendHandler =
  (pid: string, obj: any, peerId: string) => Promise<void>;

/**
 * Handler for `WHEREIS` messages.
 *
 * @returns `string` if the seeked node is known. Otherwise, it is `undefined`.
 *          This value is to be sent back with a `WHEREISOK`.
 */
type RuntimeWhereIsHandler =
  (x: string, peerId: string) => Promise<string | undefined>;

export type RuntimeHandlers = {
  /**
   * Callback for a request to spawn a new Troupe thread on this machine. If
   *  remote spawning is disabled, then this handler is `undefined`.
   */
  [MessageType.SPAWN]   : RuntimeSpawnHandler | undefined,

  /**
   * Callback for a message sent to a process on this machine.
   */
  [MessageType.SEND]    : RuntimeSendHandler,

  /**
   * Callback for a `whereis` message sent to this machine.
   */
  [MessageType.WHEREIS] : RuntimeWhereIsHandler,
};

