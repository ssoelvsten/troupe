import { Level } from './Level.mjs';

export enum DowngradeKind {
	VALUE = 1,
	BLOCKING = 2,
	MAILBOX = 3
}
    
export enum DowngradeDimension {
	CONFIDENTIALITY = 1,
	INTEGRITY = 2,
}

export enum DowngradeErrorReason {
	INTEGRITY_MISMATCH = 1,
	CONFIDENTIALITY_MISMATCH = 2,
	INSUFFICIENT_AUTHORITY = 3,
	BLOCKING_LEVEL_MISMATCH = 4
}

export type SuccessfulDowngradeResult = {
	kind: "SUCCESS";
};

export type FailedDowngradeResult = {
	kind: "FAILURE";
	reason: DowngradeErrorReason;
};

export type DowngradeResult = SuccessfulDowngradeResult | FailedDowngradeResult;

export const DowngradeResultSuccess: SuccessfulDowngradeResult = { kind: "SUCCESS" };

export type ValidateDowngradeParams = {
	downgradeKind: DowngradeKind;
	levFrom: Level;
	levTo: Level;
	authorityLevel: Level;
	downgradeDimension: DowngradeDimension;
	currentBlockingLevelForCheck: Level | null;
	operationDescription?: string;
};
