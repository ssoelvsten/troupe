'use strict';

/**
 * Label class hierarchy for DC Labels with quarantine support.
 *
 * Labels are the atomic elements within CNF Categories. They can be:
 * - RegularLabel: A principal name (e.g., "alice")
 * - QuarantinedLabel: A principal tagged with quarantine info (e.g., "alice@nodeA:uuid123")
 * - QFalseLabel: A quarantined "false" value that can authorize downgrading quarantined labels
 */

/**
 * QuarantineTag identifies a specific quarantine session.
 */
export interface QuarantineTag {
    nodeId: string;       // Node that performed the quarantine
    quarantineId: string; // UUID identifying this quarantine session
}

/**
 * Compares two quarantine tags for equality.
 */
export function sameQuarantineTag(a: QuarantineTag, b: QuarantineTag): boolean {
    return a.nodeId === b.nodeId && a.quarantineId === b.quarantineId;
}

/**
 * Label kinds for discriminated union pattern.
 */
export enum LabelKind {
    REGULAR = 'regular',
    QUARANTINED = 'quarantined',
    QFALSE = 'qfalse'
}

/**
 * JSON serialization types for labels.
 */
export type LabelJSON =
    | { kind: LabelKind.REGULAR; principal: string }
    | { kind: LabelKind.QUARANTINED; principal: string; originalPrincipal: string; quarantineTag: QuarantineTag }
    | { kind: LabelKind.QFALSE; quarantineTag: QuarantineTag };

/**
 * Characters that are forbidden in principal names to prevent confusion attacks.
 * - '@' is used in quarantine format (principal@nodeId:tag)
 * - '<', '>', ';' are used in DC label syntax
 *
 * Note: We allow UUIDs and other runtime-generated names (e.g., "2393aa6a-3090-44f8-...")
 * since the `newlabel()` primitive creates fresh labels using UUIDs.
 */
const FORBIDDEN_CHARS_REGEX = /[@<>;]/;

/**
 * Abstract base class for all label types.
 */
export abstract class Label {
    abstract readonly kind: LabelKind;

    /**
     * Returns a unique key for this label, used in Map/Set operations.
     * Keys include a kind prefix to prevent cross-type collisions.
     */
    abstract toKey(): string;

    /**
     * Returns a human-readable string representation.
     */
    abstract stringRep(): string;

    /**
     * Serializes this label to JSON.
     */
    abstract toJSON(): LabelJSON;

    /**
     * Checks equality with another label.
     */
    abstract equals(other: Label): boolean;

    /**
     * Returns true if this is a quarantined label (QuarantinedLabel or QFalseLabel).
     */
    abstract isQuarantined(): boolean;

    /**
     * Returns the quarantine tag if quarantined, null otherwise.
     */
    abstract getQuarantineTag(): QuarantineTag | null;
}

/**
 * Regular (non-quarantined) label representing a principal name.
 */
export class RegularLabel extends Label {
    readonly kind = LabelKind.REGULAR;
    readonly principal: string;

    constructor(principal: string) {
        super();
        const normalized = principal.trim().toLowerCase();

        // Validate that the principal doesn't contain forbidden characters
        // that could be confused with quarantine syntax
        if (FORBIDDEN_CHARS_REGEX.test(normalized)) {
            throw new Error(`Invalid principal name: "${principal}". ` +
                `Principals cannot contain @, <, >, or ; characters.`);
        }

        if (normalized.length === 0) {
            throw new Error(`Invalid principal name: principal cannot be empty.`);
        }

        this.principal = normalized;
    }

    toKey(): string {
        return `R:${this.principal}`;
    }

    stringRep(): string {
        return this.principal;
    }

    toJSON(): LabelJSON {
        return { kind: LabelKind.REGULAR, principal: this.principal };
    }

    equals(other: Label): boolean {
        return other.kind === LabelKind.REGULAR &&
               this.principal === (other as RegularLabel).principal;
    }

    isQuarantined(): boolean {
        return false;
    }

    getQuarantineTag(): QuarantineTag | null {
        return null;
    }
}

/**
 * Quarantined label - a principal tagged with quarantine information.
 * Stores the original label for restoration when sending back to the quarantine node.
 */
export class QuarantinedLabel extends Label {
    readonly kind = LabelKind.QUARANTINED;
    readonly principal: string;
    readonly originalLabel: Label;
    readonly quarantineTag: QuarantineTag;

    constructor(principal: string, originalLabel: Label, quarantineTag: QuarantineTag) {
        super();
        this.principal = principal.trim().toLowerCase();
        this.originalLabel = originalLabel;
        this.quarantineTag = quarantineTag;
    }

    /**
     * Creates a QuarantinedLabel from a RegularLabel.
     */
    static fromRegular(regular: RegularLabel, quarantineTag: QuarantineTag): QuarantinedLabel {
        return new QuarantinedLabel(regular.principal, regular, quarantineTag);
    }

    toKey(): string {
        return `Q:${this.principal}:${this.quarantineTag.nodeId}:${this.quarantineTag.quarantineId}`;
    }

    stringRep(): string {
        // Format: principal@nodeId:shortQuarantineId
        const shortQId = this.quarantineTag.quarantineId.substring(0, 8);
        return `${this.principal}@${this.quarantineTag.nodeId}:${shortQId}`;
    }

    toJSON(): LabelJSON {
        return {
            kind: LabelKind.QUARANTINED,
            principal: this.principal,
            originalPrincipal: this.originalLabel.kind === LabelKind.REGULAR
                ? (this.originalLabel as RegularLabel).principal
                : this.principal,
            quarantineTag: this.quarantineTag
        };
    }

    equals(other: Label): boolean {
        if (other.kind !== LabelKind.QUARANTINED) return false;
        const o = other as QuarantinedLabel;
        return this.principal === o.principal &&
               sameQuarantineTag(this.quarantineTag, o.quarantineTag);
    }

    isQuarantined(): boolean {
        return true;
    }

    getQuarantineTag(): QuarantineTag {
        return this.quarantineTag;
    }

    /**
     * Restores this quarantined label to its original form.
     * Used when serializing data back to the quarantine node.
     */
    restore(): Label {
        return this.originalLabel;
    }
}

/**
 * QFalse - represents quarantined CNF_FALSE.
 *
 * When CNF_FALSE (indicating maximal authority) is received from an untrusted source,
 * it becomes QFalse. QFalse can be used as authority to downgrade quarantined labels
 * with the same quarantine tag.
 *
 * Implication semantics: qfalse@node:tag IMPLIES any quarantined label with same node:tag
 */
export class QFalseLabel extends Label {
    readonly kind = LabelKind.QFALSE;
    readonly quarantineTag: QuarantineTag;

    constructor(quarantineTag: QuarantineTag) {
        super();
        this.quarantineTag = quarantineTag;
    }

    toKey(): string {
        return `F:${this.quarantineTag.nodeId}:${this.quarantineTag.quarantineId}`;
    }

    stringRep(): string {
        const shortQId = this.quarantineTag.quarantineId.substring(0, 8);
        return `#false@${this.quarantineTag.nodeId}:${shortQId}`;
    }

    toJSON(): LabelJSON {
        return {
            kind: LabelKind.QFALSE,
            quarantineTag: this.quarantineTag
        };
    }

    equals(other: Label): boolean {
        if (other.kind !== LabelKind.QFALSE) return false;
        return sameQuarantineTag(this.quarantineTag, (other as QFalseLabel).quarantineTag);
    }

    isQuarantined(): boolean {
        return true;
    }

    getQuarantineTag(): QuarantineTag {
        return this.quarantineTag;
    }
}

/**
 * Deserialize a label from JSON.
 */
export function labelFromJSON(json: LabelJSON): Label {
    switch (json.kind) {
        case LabelKind.REGULAR:
            return new RegularLabel(json.principal);
        case LabelKind.QUARANTINED:
            // Reconstruct the original label
            const originalLabel = new RegularLabel(json.originalPrincipal);
            return new QuarantinedLabel(json.principal, originalLabel, json.quarantineTag);
        case LabelKind.QFALSE:
            return new QFalseLabel(json.quarantineTag);
    }
}

/**
 * Check if a label implies another label.
 *
 * Implication rules:
 * - Every label implies itself
 * - QFalse implies any QuarantinedLabel with the same quarantine tag
 * - No other cross-type implications hold
 */
export function labelImplies(x: Label, y: Label): boolean {
    // Same label always implies itself
    if (x.equals(y)) return true;

    // QFalse implies any quarantined label with the same node+tag
    if (x.kind === LabelKind.QFALSE && y.kind === LabelKind.QUARANTINED) {
        return sameQuarantineTag(
            (x as QFalseLabel).quarantineTag,
            (y as QuarantinedLabel).quarantineTag
        );
    }

    return false;
}
