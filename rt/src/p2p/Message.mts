/** Enum with message tags to be used when peers send messages to each other.
 *
 * @note We did not have in Express the ability to respond to a request (see
 *       the `Reply` messages types).
 */
export enum MessageType {
  /** Spawning a function on a remote node. */
  Spawn = 0,
  /** Reply to the Spawn*/
  SpawnReply,
  /** Sending a message to a remote node. */
  Send,
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

/** Message for `Send` */
export type SendMessage = {
  messageType: MessageType.Send,
  /** Process identifier who should receive the value. */
  pid: string,
  /** Serialized value to be sent to `pid`. */
  message: any,
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
                    | SendMessage
                    | WhereIsMessage
                    | WhereIsReplyMessage
;
