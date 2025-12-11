import runId from "../runId.mjs"
import { TroupeType } from "./TroupeTypes.mjs"
import { TroupeValue } from "./TroupeValue.mjs";
import * as levels from '../Level.mjs'

let rt_uuid = runId

export class RawAtom implements TroupeValue  {
  atom: string;
  creation_uuid: string;
  _troupeType: TroupeType.Atom = TroupeType.Atom;
  dataLevel = levels.BOT;

  constructor (name: string, creation_uuid = rt_uuid) {
    this.atom = name;
    this.creation_uuid = creation_uuid;
  }

  stringRep (omitLevels: boolean = false, taintRef: any = null) {
      return this.atom;
  }
}
