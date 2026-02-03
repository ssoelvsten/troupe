import { getCliArgs, TroupeCliArg } from '../../TroupeCliArgs.mjs';

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
export const DC_DELIM_LEFT_V1  = "{"
export const DC_DELIM_RIGHT_V1 = "}"
export const DC_DELIM_SEP = ";"
export const DC_TRUST_ROOT = "#ROOT"
export const DC_IFC_TOP = "#TOP"

// export const DC_EMPTY_CAT = "\#FALSE"
// export const DC_EMPTY_CNF = "\#TRUE"

export const DC_CONF_LITERALS = { trueLit : "#null-confidentiality"
                                , falseLit: "#root-confidentiality"
                                }

export const DC_INTG_LITERALS = { trueLit : "#null-integrity"
                                , falseLit: "#root-integrity"
                                }

export function getDelimiters() {
    const argv = getCliArgs();
    const useV1 = argv[TroupeCliArg.V1Labels] !== false;
    return {
        left: useV1 ? DC_DELIM_LEFT_V1 : DC_DELIM_LEFT,
        right: useV1 ? DC_DELIM_RIGHT_V1 : DC_DELIM_RIGHT,
        sep: DC_DELIM_SEP
    };
}