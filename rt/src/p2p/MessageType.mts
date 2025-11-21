/** Enum of Message tags */
export enum MessageType {
  /** Spawning a function on a remote node. */
  SPAWN = 0,
  /** Reply to the SPAWN
   *
   * @note We did not have an analogue of this in express runtime because express was giving up the
   *       possibility of sending response to a given request. */
  SPAWNOK,
  /** Sending a message to a remote node. */
  SEND,
  /** Asking for the address of a certain peer id. */
  WHEREIS,
  /** Reply to the WHEREIS. */
  WHEREISOK,
  /** Message printed to the console at the receiver. This is merely for testing/development
   *  purposes. */
  TEST,
};
