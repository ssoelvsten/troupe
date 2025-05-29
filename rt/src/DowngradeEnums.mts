export enum DowngradeKind {
	VALUE = 1,
	BLOCKING = 2,
	MAILBOX = 3
}
    
export enum DowngradeDimension {
	CONFIDENTIALITY = 1,
	INTEGRITY = 2,
}

export enum DowngradeResult {
	SUCCESS = 0,
	INTEGRITY_MISMATCH = 1,    // For declassification when integrity levels aren't equal
	CONFIDENTIALITY_MISMATCH = 2, // For endorsement when confidentiality levels aren't equal
	INSUFFICIENT_AUTHORITY = 3,  // When auth level isn't sufficient for the downgrade
	BLOCKING_LEVEL_MISMATCH = 4 // When blocking level does not flow to target level
}
