/** Enum with message tags to be used when peers send messages to each other. */
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

/** Message for `SPAWN` */
export type SpawnMessage = {
  messageType: MessageType.SPAWN,
  /** Unique number only used once to identify a specific spawn. */
  spawnNonce: string,
  /** Serialized function to be spawned. */
  message: any,
};

/** Message for `SPAWNOK` */
export type SpawnOkMessage = {
  messageType: MessageType.SPAWNOK,
  /** Unique number only used once to identify a specific spawn. */
  spawnNonce: string,
  /** Response for a `SPAWN`; if `null` everything is ok. */
  message: any | null,
}

/** Message for `SEND` */
export type SendMessage = {
  messageType: MessageType.SEND,
  /** Process identifier who should receive the value. */
  pid: string,
  /** Serialized value to be sent to `pid`. */
  message: any,
}

/** Message for `WHEREIS` */
export type WhereIsMessage = {
  messageType: MessageType.WHEREIS,
  /** Unique number used once to identify a specific `WHEREIS` request. */
  whereisNonce: string,
  /** Identifier for peer. */
  message: string
}

/** Message for `WHEREISOK` */
export type WhereIsOkMessage = {
  messageType: MessageType.WHEREISOK,
  /** Unique number used once to identify a specific `WHEREIS` request. */
  whereisNonce: string,
  /** Address for requested peer. */
  message: string
}

/** Message for `TEST` */
export type TestMessage = {
  messageType: MessageType.TEST
}

/** Type of all messages. */
export type Message = SpawnMessage
                    | SpawnOkMessage
                    | SendMessage
                    | WhereIsMessage
                    | WhereIsOkMessage
                    | TestMessage;
