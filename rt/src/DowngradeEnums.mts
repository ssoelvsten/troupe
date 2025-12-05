import { Level } from './Level.mjs';


export enum DowngradeKind {
	Value = 1,
	Blocking = 2,
	Mailbox = 3
}
    
export enum DowngradeDimension {
	Confidentiality = 1,
	Integrity = 2,
}

export enum DowngradeErrorReason {
	IntegrityMismatch = 1,
	ConfidentialityMismatch = 2,
	InsufficientAuthority = 3,
	BlockingLevelMismatch = 4
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

export function DowngradeError(reason: DowngradeErrorReason): FailedDowngradeResult {
	return { kind: "FAILURE", reason };
}

export type ValidateDowngradeParams = {
	downgradeKind: DowngradeKind;
	levFrom: Level;
	levTo: Level;
	authorityLevel: Level;
	downgradeDimension: DowngradeDimension;
	blockLevel?: Level ; 
	operationDescription?: string;
};
