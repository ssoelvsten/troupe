import { Level } from './Level.mjs';
import { DC_INTG_LITERALS, DC_CONF_LITERALS } from './levels/DCLabels/dcl_pp_config.mjs';

export function formatIntegrityMismatchMsg(operationDescription: string, dataLevel: Level, targetLevel: Level): string {
    return `Integrity level mismatch for ${operationDescription}\n` +
           ` | integrity level of the data: ${dataLevel.integrity.stringRep(DC_INTG_LITERALS)}\n` +
           ` | integrity level of the target: ${targetLevel.integrity.stringRep(DC_INTG_LITERALS)}`;
}

export function formatConfidentialityMismatchMsg(operationDescription: string, dataLevel: Level, targetLevel: Level): string {
    return `Confidentiality level mismatch for ${operationDescription}\n` +
           ` | confidentiality level of the data: ${dataLevel.confidentiality.stringRep(DC_CONF_LITERALS)}\n` +
           ` | confidentiality level of the target: ${targetLevel.confidentiality.stringRep(DC_CONF_LITERALS)}`;
}

export function formatPiniBlockingLevelMismatchMsg(operationDescription: string, currentBlockingLevel: Level, targetBlockingLevel: Level): string {
    return `Current blocking level does not flow to the target level of the ${operationDescription}\n` +
           ` | current blocking level: ${currentBlockingLevel.stringRep()}\n` +
           ` | target blocking level: ${targetBlockingLevel.stringRep()}`;
}

export function formatPiniInsufficientAuthorityMsg(operationDescription: string, fromBlockingLevel: Level, authorityValLevel: Level, toBlockingLevel: Level): string {
    return `Not enough authority for ${operationDescription}\n` +
           ` | from level of the blocking level: ${fromBlockingLevel.stringRep()}\n` +
           ` | level of the authority: ${authorityValLevel.stringRep()}\n`  +
           ` | to level of the blocking level: ${toBlockingLevel.stringRep()}`;
}

export function formatMboxBlockingLevelMismatchMsg(currentBlockingLevel: Level, targetMailboxLevel: Level): string {
    return `Current blocking level does not flow to the target level for lowering mailbox clearance\n` +
           ` | current blocking level: ${currentBlockingLevel.stringRep()}\n` +
           ` | target mailbox level: ${targetMailboxLevel.stringRep()}`;
}

export function formatMboxInsufficientAuthorityMsg(authorityProvidedLevel: Level, currentMailboxLevel: Level, targetMailboxLevel: Level): string {
    return `Insufficient authority for lowering the mailbox clearance\n` +
           `| authority provided: ${authorityProvidedLevel.stringRep()}\n` +
           `| current level of the mailbox: ${currentMailboxLevel.stringRep()}\n` +
           `| target level of the mailbox: ${targetMailboxLevel.stringRep()}`;
} 