import { AbstractLevel, AbstractLevelSystem } from '../../AbstractLevel.mjs';
import { DowngradeKind, DowngradeDimension, DowngradeResult, DowngradeErrorReason, DowngradeResultSuccess, DowngradeError } from '../../DowngradeEnums.mjs';
import { tagsetStringRep } from '../tagsets.mjs';
import { Category
       , CNF
       , CNF_FALSE
       , CNF_TRUE
       , implies
       , conjunction
       , disjunction
    } from './cnf.mjs'
import { DC_CONF_LITERALS, DC_DELIM_LEFT, DC_DELIM_RIGHT, DC_DELIM_SEP, DC_IFC_TOP, DC_INTG_LITERALS, DC_TRUST_ROOT, getDelimiters } from './dcl_pp_config.mjs';

import { getCliArgs, TroupeCliArg } from '../../TroupeCliArgs.mjs';
import { mkLogger } from '../../logger.mjs';

// const argv = getCliArgs();
// const logLevel = argv[TroupeCliArg.Debug] ? 'debug' : 'info';
// const logger = mkLogger('DCLabel', logLevel);
// const debug = x => logger.debug(x);

export class DCLabel extends AbstractLevel<DCLabel> {
    integrity: CNF
    confidentiality: CNF

    get dataLevel () {
        return IFC_BOT
    }

    _cachedStringRepresentation: string = null ;

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
        <S_1, I_1> actsfor <S_2, I_2>

        assuming this = <S_1, I_1>
        */

        return implies(this.confidentiality, other.confidentiality)
            && implies(this.integrity, other.integrity);
        
    }

    equals(other: DCLabel): boolean {
        return this.flowsTo(other) && other.flowsTo(this);
    }

    isTagsetCompatible() : boolean |  Set<string> {
        if (this.confidentiality.categories.size == 0) {
            return false;
        }

        if (this.integrity.categories.size != 1) {
            return false; 
        }
        const _the_integrity: Category = 
            this.integrity.categories.values().next().value;

        const s :Set <string> = _the_integrity.labels;


        for (let cat of this.confidentiality.categories) {
            if (cat.labels.size == 1) {
                // debug (`isTagsetCompatible: cat.labels.size is 1`);
                const l:string  = cat.labels.values().next().value;
                // debug (`checking the label ${l}`)
                if (!s.has(l)) {
                    return false; 
                }
            } else {
                // debug (`isTagsetCompatible: cat.labels.size is ${cat.labels.size}`);
                return false;
            }
        }

        return s;
    }


    stringRep(): string {
        if (this._cachedStringRepresentation) {
            return this._cachedStringRepresentation
        }

        const delims = getDelimiters();

        if (this.flowsTo(IFC_BOT)) {
            this._cachedStringRepresentation =
                delims.left + delims.right
        } else if (IFC_TOP.flowsTo(this)) {
            this._cachedStringRepresentation =
                delims.left + DC_IFC_TOP + delims.right
        } else if (TRUST_ROOT.flowsTo(this) && this.flowsTo(TRUST_ROOT)) {
            this._cachedStringRepresentation =
                delims.left + DC_TRUST_ROOT + delims.right
        } else {
            let s = this.isTagsetCompatible()
            if (s) {
                this._cachedStringRepresentation =
                    tagsetStringRep(s as Set<string>, delims.left, delims.right);
            } else {
                this._cachedStringRepresentation =
                    DC_DELIM_LEFT +
                    this.confidentiality.stringRep(DC_CONF_LITERALS) +
                    DC_DELIM_SEP +
                    this.integrity.stringRep(DC_INTG_LITERALS) +
                    DC_DELIM_RIGHT
            }
        }

        return this._cachedStringRepresentation;
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

    // TODO: Performance optimization - if this path becomes a bottleneck, consider
    // adding a fromSingleTagNormalized() variant that skips normalization for cases
    // where the frontend (e.g., IR processor/lexer) has already normalized the tag.
    static fromSingleTag (s:string):DCLabel {
        // Normalize case for consistency with tagsets and lexer (defensive programming)
        let labels = new Set ([s.trim().toLowerCase()])
        let cat = new Category(labels)
        let cnf = new CNF (new Set ([cat]))
        return new DCLabel(cnf, cnf)
    }

    /**
     * Returns the reflection of this label: <i, c> for a label <c, i>
     */
    reflection(): DCLabel {
        return new DCLabel(this.integrity, this.confidentiality);
    }

    /**
     * A label <S, I> is corrupt iff it does not flow to its reflection <I, S>.
     * This simplifies to: NOT (I ⟹ S), i.e., integrity does not imply confidentiality.
     */
    isCorrupt(): boolean {
        return !implies(this.integrity, this.confidentiality);
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
        let str = str1.startsWith ("{") && str1.endsWith ("}") ?
                str1.substring(1, str1.length - 1) :
                str1;
        
        str = str.trim();
        if (str == "") {
            return IFC_BOT
        }

        if (str == "#TOP") {
            return IFC_TOP;
        }

        let s = new Set ();
        const tags = str.split(',');
        const dcs = tags.map (t => DCLabel.fromSingleTag(t))
        return this.lub (...dcs)
    }

    
    okToDowngradeGeneric (kind: DowngradeKind, dimension: DowngradeDimension) {
        return (( l_from : DCLabel
                , l_to   : DCLabel
                , l_auth : DCLabel
                , bl     : DCLabel
                , isNMIFC: boolean = false
                , pc     : DCLabel = null ) : DowngradeResult => {


            if (kind === DowngradeKind.VALUE && !this.flowsTo(bl, l_to)) {
                return DowngradeError(DowngradeErrorReason.BLOCKING_LEVEL_MISMATCH);
            }

            /*

            S_auth /\ S_to ==> S_from        I_auth /\ I_from ==> I_to
            -----------------------------------------------------------
                <S_from, I_from> flowsto_{l_auth} <S_to, I_to>

            */

            switch (dimension) {
                case DowngradeDimension.INTEGRITY:
                    if (!l_from.confidentiality.equals(l_to.confidentiality)) {
                        return DowngradeError(DowngradeErrorReason.CONFIDENTIALITY_MISMATCH);
                    }
                    break;
                case DowngradeDimension.CONFIDENTIALITY:
                    if (!l_from.integrity.equals(l_to.integrity)) {
                        return DowngradeError(DowngradeErrorReason.INTEGRITY_MISMATCH);
                    }
                    break;
                case DowngradeDimension.BOTH:
                    // Cross-dimensional downgrade: allow both dimensions to change
                    // No mismatch checks needed
                    break;
            }

            let enough_confidentiality =
                implies( conjunction ( l_auth.confidentiality
                                ,   l_to.confidentiality)
                    , l_from.confidentiality)
            let enough_integrity =
                implies( conjunction ( l_auth.integrity
                                    , l_from.integrity)
                    , l_to.integrity)

            if (!(enough_confidentiality && enough_integrity)) {
                return DowngradeError(DowngradeErrorReason.INSUFFICIENT_AUTHORITY);
            }

            /*
               NMIFC checks (see Troupe security model document, Section 2.3)

               Robust declassification (confidentiality dimension):
                 (S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from

               Transparent endorsement (integrity dimension):
                 I_from ⟹ I_to ∨ (S_from ∧ S_pc)
            */
            if (isNMIFC) {
                // Helper to check robustness (for CONFIDENTIALITY and BOTH)
                const checkRobustness = () => {
                    // Robust declassification: (S_auth ∨ I_from ∨ I_pc) ∧ S_to ⟹ S_from
                    const s_auth_or_i_from_or_i_pc = disjunction(
                        disjunction(l_auth.confidentiality, l_from.integrity),
                        pc.integrity
                    );
                    return implies(
                        conjunction(s_auth_or_i_from_or_i_pc, l_to.confidentiality),
                        l_from.confidentiality
                    );
                };

                // Helper to check transparency (for INTEGRITY and BOTH)
                const checkTransparency = () => {
                    // Transparent endorsement: I_from ⟹ I_to ∨ (S_from ∧ S_pc)
                    const s_from_and_s_pc = conjunction(l_from.confidentiality, pc.confidentiality);
                    const i_to_or_secret = disjunction(l_to.integrity, s_from_and_s_pc);
                    return implies(l_from.integrity, i_to_or_secret);
                };

                switch (dimension) {
                    case DowngradeDimension.CONFIDENTIALITY: {
                        if (!checkRobustness()) {
                            return DowngradeError(DowngradeErrorReason.ROBUSTNESS_VIOLATION);
                        }
                        break;
                    }
                    case DowngradeDimension.INTEGRITY: {
                        if (!checkTransparency()) {
                            return DowngradeError(DowngradeErrorReason.TRANSPARENCY_VIOLATION);
                        }
                        break;
                    }
                    case DowngradeDimension.BOTH: {
                        // Cross-dimensional downgrade: check BOTH robustness AND transparency
                        if (!checkRobustness()) {
                            return DowngradeError(DowngradeErrorReason.ROBUSTNESS_VIOLATION);
                        }
                        if (!checkTransparency()) {
                            return DowngradeError(DowngradeErrorReason.TRANSPARENCY_VIOLATION);
                        }
                        break;
                    }
                }
            }

            return DowngradeResultSuccess;
        }
     )}

    okToEndorse = this.okToDowngradeGeneric (DowngradeKind.VALUE, DowngradeDimension.INTEGRITY)
    okToDeclassify = this.okToDowngradeGeneric (DowngradeKind.VALUE, DowngradeDimension.CONFIDENTIALITY)
    okToCrossDimensionalDowngrade = this.okToDowngradeGeneric (DowngradeKind.VALUE, DowngradeDimension.BOTH)
    okToDowngrade (kind: DowngradeKind, dimension: DowngradeDimension) {
        return this.okToDowngradeGeneric(kind, dimension);
    }


}

export const mkLevel = DCLabel.fromJSON
export type Level = DCLabel
export const levels = new DCLevelSystem ()