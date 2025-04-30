import { Category
       , CNF
       , CNF_FALSE
       , CNF_TRUE
       , implies
       , conjunction
       , disjunction
    } from './cnf.mjs'

abstract class Level { // 2025-04-26; to be later replaced 
    // with the level from the Troupe repo

}

export class DCLabel {
    integrity: CNF
    confidentiality: CNF
    constructor(c: CNF, i: CNF) {
        this.confidentiality = c;
        this.integrity = i;
    }

    flowsTo(other: DCLabel): boolean {
        /* 
        S_2 ==> S1         I1 ==> I_2
        -------------------------------
        <S_1, I_1> flowsto <S_2, I_2>
    	
        */
        return implies(other.confidentiality, this.integrity) &&
            implies(this.integrity, other.confidentiality);

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

