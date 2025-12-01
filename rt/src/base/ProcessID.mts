import { TroupeRawValue } from "./TroupeRawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";
import { BOT } from '../Level.mjs'

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

