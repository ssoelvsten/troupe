'use strict'

import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
import { DCLabel } from './levels/DCLabels/dclabel.mjs';
import { implies } from './levels/DCLabels/cnf.mjs';

/**
 * Actions for handling integrity-only overclaim during ingress.
 *
 * When receiving data where:
 * - Confidentiality (C) is within trust bounds
 * - Integrity (I) exceeds trust bounds
 *
 * Two options:
 * - RAISE_TAINT: Relabel I to I_n (the trust level's integrity)
 * - QUARANTINE: Quarantine both I and C
 */
export enum IntegrityOnlyDistrustAction {
    RAISE_TAINT = 'raise_taint',
    QUARANTINE = 'quarantine'
}

let _configured = false;
let _integrityOnlyDistrustAction: IntegrityOnlyDistrustAction = IntegrityOnlyDistrustAction.QUARANTINE;

/**
 * Ensures configuration is loaded from CLI args on first access.
 * Uses lazy initialization pattern (similar to colorConfig.mts).
 */
function ensureConfigured(): void {
    if (_configured) return;

    const argv = getCliArgs();
    const value = argv[TroupeCliArg.IntegrityOnlyDistrust];

    if (value === 'raise_taint') {
        _integrityOnlyDistrustAction = IntegrityOnlyDistrustAction.RAISE_TAINT;
    }
    // else stays at default QUARANTINE (yargs default ensures this)

    _configured = true;
}

/**
 * Get the configured action for integrity-only overclaim.
 */
export function getIntegrityOnlyDistrustAction(): IntegrityOnlyDistrustAction {
    ensureConfigured();
    return _integrityOnlyDistrustAction;
}

/**
 * Set the action for integrity-only overclaim.
 * Primarily for testing purposes - normal usage reads from CLI args.
 */
export function setIntegrityOnlyDistrustAction(action: IntegrityOnlyDistrustAction): void {
    _integrityOnlyDistrustAction = action;
    _configured = true;
}

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
