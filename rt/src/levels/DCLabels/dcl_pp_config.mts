import { getCliArgs, TroupeCliArg } from '../../TroupeCliArgs.mjs';

export enum Delimiterification {
    None,
    AsNeeded,
    Always
}

export enum LabelStringFormat {
    V1,     // Tagset shorthand: {alice}
    V2,     // DC label with null-component elision: <alice;alice>
    V2Full  // DC label fully explicit: <#null-confidentiality;#root-integrity>
}

export function getDefaultLabelStringFormat(): LabelStringFormat {
    const argv = getCliArgs();
    switch (argv[TroupeCliArg.LabelFormat]) {
        case 'v2':      return LabelStringFormat.V2;
        case 'v2-full': return LabelStringFormat.V2Full;
        default:        return LabelStringFormat.V1;
    }
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
export const DC_TRUST_NULL = "#NULL"
export const DC_IFC_TOP = "#TOP"

// export const DC_EMPTY_CAT = "\#FALSE"
// export const DC_EMPTY_CNF = "\#TRUE"

export const DC_CONF_LITERALS = { trueLit : "#null-confidentiality"
                                , falseLit: "#root-confidentiality"
                                }

export const DC_INTG_LITERALS = { trueLit : "#null-integrity"
                                , falseLit: "#root-integrity"
                                }

export function getDelimiters(format?: LabelStringFormat) {
    const fmt = format ?? getDefaultLabelStringFormat();
    if (fmt === LabelStringFormat.V1) {
        return { left: DC_DELIM_LEFT_V1, right: DC_DELIM_RIGHT_V1, sep: DC_DELIM_SEP };
    }
    return { left: DC_DELIM_LEFT, right: DC_DELIM_RIGHT, sep: DC_DELIM_SEP };
}