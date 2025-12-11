/** Enum with message tags to be used when peers send messages to each other.
 *
 * @note We did not have in Express the ability to respond to a request (see
 *       the `Reply` messages types).
 */
export enum MessageType {
  /** Spawning a function on a remote node. */
  Spawn = 0,
  /** Reply to the Spawn */
  SpawnReply,
  /** Sending a message to a remote node with the value directly included.
   *
   * @todo This will be renamed back to `Send` when merged with `SendByHash`.
   */
  SendByValue,
  /** Sending a message to a remote node with only a reference by hash.
   *
   * @todo This should be merged together with `SendByValue` later, when we
   *       want to add fine-grained hash references, e.g. closure references.
   *       This needs to be done inside of Serialization.
  */
  SendByHash,
  /** Asking for the value associated with a given hash. */
  RequestHash,
  /** Reply to the `RequestHash */
  RequestHashReply,
  /** Asking for the address of a certain peer id. */
  WhereIs,
  /** Reply to the `WhereIs`. */
  WhereIsReply,
};

/** Message for `Spawn` */
export type SpawnMessage = {
  messageType: MessageType.Spawn,
  /** Unique `uuid` only used once to identify a specific spawn. */
  spawnNonce: string,
  /** Serialized function to be spawned. */
  message: any,
};

/** Message for `SpawnReply` */
export type SpawnReplyMessage = {
  messageType: MessageType.SpawnReply,
  /** Unique `uuid` only used once to identify a specific spawn. */
  spawnNonce: string,
  /** Response for a `Spawn`; if `null` everything is ok. */
  message: any | null,
}

/** Message for `SendByValue`
 *
 * @todo This will be merged with `SendByHash`.
 */
export type SendByValueMessage = {
  messageType: MessageType.SendByValue,
  /** Process identifier who should receive the value. */
  pid: string,
  /** Serialized value to be sent to `pid`. */
  message: any,
}

/** Message for `SendByHash`
 *
 * @todo This will be merged back with `SendByValue`.
 */
export type SendByHashMessage = {
  messageType: MessageType.SendByHash,
  /** Process identifier who should receive the value. */
  pid: string,
  /** Serialized `LVal<string>` of the hash sent to `pid`. */
  message: any,
}

/** Message for `RequestHash` */
export type RequestHashMessage = {
  messageType: MessageType.RequestHash,
  /** Unique `uuid` used once to identify a specific `RequestHash` message. */
  hashNonce: string,
  /** Requested hash key as a serialized `LVal<string>`. */
  hash: any,
}

/** Message for `RequestHashReply` */
export type RequestHashReplyMessage = {
  messageType: MessageType.RequestHashReply,
  /** Unique `uuid` used once to identify a specific `RequestHash` request. */
  hashNonce: string,
  /** The (serialized) value associated with the given hash. */
  value: any,
}

/** Message for `WhereIs` */
export type WhereIsMessage = {
  messageType: MessageType.WhereIs,
  /** Unique `uuid` used once to identify a specific `WhereIs` request. */
  whereisNonce: string,
  /** Identifier for peer. */
  message: string
}

/** Message for `WhereIsReply` */
export type WhereIsReplyMessage = {
  messageType: MessageType.WhereIsReply,
  /** Unique `uuid` used once to identify a specific `WhereIs` request. */
  whereisNonce: string,
  /** Address for requested peer. */
  message: string
}

/** Type of all messages. */
export type Message = SpawnMessage
                    | SpawnReplyMessage
                    | SendByValueMessage
                    | SendByHashMessage
                    | RequestHashMessage
                    | RequestHashReplyMessage
                    | WhereIsMessage
                    | WhereIsReplyMessage
;
