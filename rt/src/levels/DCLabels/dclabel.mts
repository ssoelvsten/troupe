import { AbstractLevel, AbstractLevelSystem } from '../../AbstractLevel.mjs';
import { TOP } from '../singleton.mjs';
import { Category
       , CNF
       , CNF_FALSE
       , CNF_TRUE
       , implies
       , conjunction
       , disjunction
    } from './cnf.mjs'
import { DC_DELIM_LEFT, DC_DELIM_RIGHT, DC_DELIM_SEP } from './dcl_pp_config.mjs';


export class DCLabel extends AbstractLevel<DCLabel> {
    integrity: CNF
    confidentiality: CNF

    get dataLevel () {
        return IFC_BOT
    }

    constructor(c: CNF, i: CNF) {
        super ()
        this.confidentiality = c;
        this.integrity = i;
        
    }

    flowsTo(other: DCLabel): boolean {
        /* 
        S_2 ==> S1         I1 ==> I_2
        -------------------------------
        <S_1, I_1> flowsto <S_2, I_2>

        assuming this = <S_1, I_1>
    	
        */
        return implies(other.confidentiality, this.confidentiality) 
            && implies(this.integrity, other.integrity);

    }

    actsFor(other:DCLabel) : boolean {
        /* 
        returns true if this label actsfor another label. 

        S_1 ==> S2         I_1 ==> I_2
        -------------------------------
        <S_1, I_1> flowsto <S_2, I_2>

        assuming this = <S_1, I_1>
        */

        return implies(this.confidentiality, other.confidentiality)
            && implies(this.integrity, other.integrity);
        
    }


    stringRep(): string {
        return DC_DELIM_LEFT + 
            this.confidentiality.stringRep() + 
            DC_DELIM_SEP +
            this.integrity.stringRep() + 
            DC_DELIM_RIGHT
    }

    
    /* 

    L1 ⊔ L2 = <S1 /\ S2, I1 \/ I2) 
    L1 ⊓ L2 = <S1 \/ S2, I1 /\ I2) 

    */

    join (other:DCLabel): DCLabel {
        return new DCLabel (
             conjunction (this.confidentiality, other.confidentiality)
           , disjunction (this.integrity, other.integrity)
        )
    }

    meet (other:DCLabel): DCLabel {
        return new DCLabel (
             disjunction (this.confidentiality, other.confidentiality)
           , conjunction (this.integrity, other.integrity)
        );
    }


    toJSON () {
        return { confidentiality: this.confidentiality.toJSON() 
               , integrity: this.integrity.toJSON()  
        }
    }

    static fromJSON (o: { confidentiality: [[string]]
                        ; integrity: [[string]]; }) {
        return new DCLabel(CNF.fromJSON(o.confidentiality)
                         , CNF.fromJSON(o.integrity))
    }

    static fromSingleTag (s:string):DCLabel {
        let labels = new Set ([s])
        let cat = new Category(labels)
        let cnf = new CNF (new Set ([cat]))
        return new DCLabel(cnf, cnf)
    }
}



/*  
                   ⊤ = <False, True>  (most secret, least trusted)

<True, True>                      <False, False>  (TOP TRUST  = most secret, most trusted)

                   ⊥ = <True, False>  (most public, least garbage)
*/

/// see fabric paper https://www.cs.cornell.edu/andru/papers/jfabric/jfabric.pdf 
/// for the intuition about trust


export const IFC_BOT = new DCLabel(CNF_TRUE, CNF_FALSE)
export const IFC_TOP = new DCLabel(CNF_FALSE, CNF_TRUE)
export const TRUST_NULL = new DCLabel(CNF_TRUE, CNF_TRUE)
export const TRUST_ROOT = new DCLabel(CNF_FALSE, CNF_FALSE)


export class DCLevelSystem extends AbstractLevelSystem<DCLabel> {
    BOT = IFC_BOT
    TOP = IFC_TOP
    NULL = TRUST_NULL
    ROOT = TRUST_ROOT
    flowsTo(a: DCLabel, b: DCLabel): boolean {
        return a.flowsTo (b);   
    }

    actsFor(a: DCLabel, b: DCLabel): boolean {
        return a.actsFor (b);   
    }

    

    glb(a: DCLabel, b: DCLabel): DCLabel {
         return a.meet(b)
    }

    // 2025-05-24: TODO
    // - make a better version of this
    lub(...ls: DCLabel[]): DCLabel {
        if (ls.length == 0) {
            return IFC_BOT
        }
        let r = ls[0]
        for (let i = 1; i < ls.length; i ++) {
            r = r.join (ls[i])
        }
        return r;
    }

    fromV1String (str2:string):DCLabel {
        const str1 = str2.trim();
        const str = str1.startsWith ("{") && str1.endsWith ("}") ?
                str1.substring(1, str1.length - 1) :
                str1;

        if (str == "#TOP") {
            return IFC_TOP;
        }

        let s = new Set ();
        const tags = str.split(',');
        const dcs = tags.map (t => DCLabel.fromSingleTag(t))
        return this.lub (...dcs)
    }
}

export const mkLevel = DCLabel.fromJSON
export type Level = DCLabel
export const levels = new DCLevelSystem ()