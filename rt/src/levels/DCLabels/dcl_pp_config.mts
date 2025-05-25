export enum Delimiterification {
    None,
    AsNeeded, 
    Always
}

export const DISJ_OPERATOR = "|"
export const CONJ_OPERATOR = "&"
export const CAT_DELIM_LEFT = "("
export const CAT_DELIM_RIGHT = ")"
export const DC_DELIM_LEFT = "<"
export const DC_DELIM_RIGHT = ">"
export const DC_DELIM_SEP = ","
// export const DC_EMPTY_CAT = "\#FALSE"
// export const DC_EMPTY_CNF = "\#TRUE"

export const DC_CONF_LITERALS = { trueLit : "#null-confidentiality"
                                , falseLit: "#root-confidentiality"
                                }

export const DC_INTG_LITERALS = { trueLit : "#null-integrity"
                                , falseLit: "#root-integrity" 
                                }