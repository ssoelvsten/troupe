'use strict'

import { DCLabel } from './levels/DCLabels/dclabel.mjs';
import { implies } from './levels/DCLabels/cnf.mjs';

/**
 * Check if a label has "regular" trust where I ⟺ C.
 *
 * A regular trust label has equivalent integrity and confidentiality,
 * meaning the node is trusted to the same degree for both components.
 *
 * This is used during ingress to determine if partial quarantine logic applies.
 * Quarantining is defined only for nodes with regular trust.
 */
export function isRegularTrust(label: DCLabel): boolean {
    return implies(label.integrity, label.confidentiality)
        && implies(label.confidentiality, label.integrity);
}

/**
 * Classification of a label for ingress quarantine decision.
 */
export enum IngressClassification {
    /** Trust level covers this label - no quarantine needed */
    TRUSTED = 'trusted',
    /** Neither component within trust - full quarantine */
    FULL_OVERCLAIM = 'full_overclaim',
    /** Confidentiality OK, integrity exceeds trust */
    INTEGRITY_OVERCLAIM = 'integrity_overclaim'
}

/**
 * Classify a label for ingress quarantine decision.
 *
 * Given a trust level <C_n, I_n>, determines how to handle the incoming label:
 * - TRUSTED: Trust level acts-for this label (no quarantine needed)
 * - FULL_OVERCLAIM: Neither component within trust (full quarantine)
 * - INTEGRITY_OVERCLAIM: Confidentiality within trust, integrity exceeds
 *
 * @param label The incoming label to classify
 * @param trustLevel The receiving node's trust level for the sender
 * @returns Classification for quarantine decision
 */
export function classifyForIngress(label: DCLabel, trustLevel: DCLabel): IngressClassification {
    // Check if trust level covers each component
    // C_n => C means trustLevel.confidentiality implies label.confidentiality
    const confidentialityWithinTrust = implies(
        trustLevel.confidentiality,
        label.confidentiality
    );

    // I_n => I means trustLevel.integrity implies label.integrity
    const integrityWithinTrust = implies(
        trustLevel.integrity,
        label.integrity
    );

    if (confidentialityWithinTrust && integrityWithinTrust) {
        return IngressClassification.TRUSTED;
    }

    if (confidentialityWithinTrust && !integrityWithinTrust) {
        return IngressClassification.INTEGRITY_OVERCLAIM;
    }

    // Either both exceed, or only confidentiality exceeds
    // The spec only defines integrity_overclaim separately, so treat
    // confidentiality-only overclaim as full_overclaim
    return IngressClassification.FULL_OVERCLAIM;
}
