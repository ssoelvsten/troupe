import { TroupeRawValue } from "./TroupeRawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";
import { BOT } from '../Level.mjs'

export function pid_val_equals (v1: ProcessID, v2: ProcessID) {
  return v1.pid.toString() == v2.pid.toString();
}

export class ProcessID implements TroupeRawValue {
    _troupeType = TroupeType.PROCESS_ID;
    uuid: any;
    pid: any;
    node: any;
    dataLevel = BOT;

    constructor(rt_uuid, pid, node) {
      this.uuid = rt_uuid;
      this.pid = pid;
      this.node = node;
    }

    toString () {
      return this.pid.toString();
    }

    stringRep() {
      return this.toString();
    }
}

