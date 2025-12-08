import { MessageType } from './Message.mjs'
import { LVal } from '../base/LVal.mjs'

/**
 * Handler for `Spawn` messages.
 *
 * @returns The `LVal` to be sent back with a `SpawnReply`.
 */
type RuntimeSpawnHandler =
  (f: any, peerId: string) => Promise<LVal>;

/**
 * Handler for `Send` messages.
 */
type RuntimeSendHandler =
  (pid: string, obj: any, peerId: string) => Promise<void>;

/**
 * Handler for `WhereIs` messages.
 *
 * @returns `string` if the seeked node is known. Otherwise, it is `undefined`.
 *          This value is to be sent back with a `WhereIsReply`.
 */
type RuntimeWhereIsHandler =
  (x: string, peerId: string) => Promise<string | undefined>;

export type RuntimeHandlers = {
  /**
   * Callback for a request to spawn a new Troupe thread on this machine. If
   *  remote spawning is disabled, then this handler is `undefined`.
   */
  [MessageType.Spawn]      : RuntimeSpawnHandler | undefined,

  /**
   * Callback for a message sent to a process on this machine.
   */
  [MessageType.SendByValue] : RuntimeSendHandler,

  /**
   * Callback for a `whereis` message sent to this machine.
   */
  [MessageType.WhereIs]     : RuntimeWhereIsHandler,
};

