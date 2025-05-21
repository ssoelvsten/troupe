
import { AbstractLevel }  from '../AbstractLevel.mjs'


export class Singleton extends AbstractLevel {
    isTop = true
    get dataLevel () {
        return __theLevel; // observe delayed 
    }
    constructor () {
        super();
    }

    stringRep () {
        return "{-}"
        
    }
}

let __theLevel = new Singleton()


export function lub (...ls:Singleton[]):Singleton {
    return __theLevel
}


export function glb (l1:Singleton, l2:Singleton):Singleton {
    return __theLevel
}

export function flowsTo (l1:Singleton, l2:Singleton):boolean {
    return true;
    
}



function fromString (str2): Singleton {
    return __theLevel    
}



export function lubs (x) {
    return __theLevel
  
}


export let BOT = __theLevel
export let TOP = __theLevel 
export let mkLevel = fromString
// export type Level = Singleton