import { RawValue } from "./RawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";
import { BOT } from '../Level.mjs'

export class RawProcessID implements RawValue {
    _troupeType = TroupeType.PROCESS_ID;
    uuid: string | null;
    pid: string;

    // HACK: The type is `Node` from `NodeManager.mts`. But, that type is not
    //       exported.
    node: any;
    dataLevel = BOT;

    constructor(rt_uuid: string | null, pid: string, node: any) {
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
