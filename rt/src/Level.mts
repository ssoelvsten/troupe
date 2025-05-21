// import { TroupeType } from "./TroupeTypes.mjs";
// import { TroupeRawValue } from "./TroupeRawValue.mjs";
// // import levels from './options';

// export abstract class Level implements TroupeRawValue {
//   lev: any;
//   isLevel: boolean = true ;
//   _troupeType: TroupeType = TroupeType.LEVEL
//   abstract dataLevel;

//   constructor(lev) {
//     this.lev = lev;        
//   }    

//   stringRep () {
//     return this.lev.toString();
//   }

// }


// export {Level} from "./levels/tagsets.mjs"

import  { TagLevel } from './levels/tagsets.mjs'
export type Level = TagLevel 
