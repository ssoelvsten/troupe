import { TroupeRawValue } from "./TroupeRawValue.mjs";
import { TroupeType } from "./TroupeTypes.mjs";
import { BOT } from '../Level.mjs'
import { LVal } from "./LVal.mjs";

export function pid_val_equals (v1: ProcessID, v2: ProcessID) {
  return v1.pid.toString() == v2.pid.toString();
}

export function pid_equals (o1: LVal, o2: LVal) {
    return pid_val_equals(o1.val, o2.val);
}

export class ProcessID implements TroupeRawValue {
    _troupeType = TroupeType.PROCESS_ID
    uuid: any;
    pid: any;
    node: any;
    stringRep: () => string;
    equals: (o1: any, o2: any) => boolean;
    dataLevel = BOT 
    constructor(rt_uuid, pid, node) {      
      this.uuid = rt_uuid;
      this.pid = pid;
      this.node = node ; // getLocalNode();
      this.equals = pid_equals;
      this.stringRep = this.toString;
    }   
  
    toString () {      
      let x = this.pid.toString();
      // console.log (x);
      return x;
    }
}

