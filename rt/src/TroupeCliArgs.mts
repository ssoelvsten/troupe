import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export enum TroupeCliArg {
    Debug = 'debug',
    DebugSandbox = 'debugsandbox',
    DebugMailbox = 'debugmailbox',
    DebugP2p = 'debugp2p',
    Pini = 'pini',
    ShowStack = 'showStack',
    Trustmap = 'trustmap',
    Id = 'id',
    LocalOnly = 'localonly',
    Persist = 'persist',
    Aliases = 'aliases',
    Stdiolev = 'stdiolev',
    Port = 'port',
    File = 'file',
    RSpawn = 'rspawn',
}

export interface ParsedArgs {
    [TroupeCliArg.Debug]?: boolean;
    [TroupeCliArg.DebugSandbox]?: boolean;
    [TroupeCliArg.DebugMailbox]?: boolean;
    [TroupeCliArg.DebugP2p]?: boolean;
    [TroupeCliArg.Pini]?: boolean;
    [TroupeCliArg.ShowStack]?: boolean;
    [TroupeCliArg.Trustmap]?: string;
    [TroupeCliArg.Id]?: string;
    [TroupeCliArg.LocalOnly]?: boolean;
    [TroupeCliArg.Persist]?: boolean;
    [TroupeCliArg.Aliases]?: string;
    [TroupeCliArg.Stdiolev]?: string;
    [TroupeCliArg.Port]?: number;
    [TroupeCliArg.File]?: string;
    [TroupeCliArg.RSpawn]?: boolean;
    [key: string]: any;
}

let parsedArgs: ParsedArgs | null = null;

export function getCliArgs(): ParsedArgs {
    if (!parsedArgs) {
        const rawArgs = yargs(hideBin(process.argv))
            .option(TroupeCliArg.Debug, { alias: 'd', type: 'boolean', default: false, describe: 'Enable general debug logging' })
            .option(TroupeCliArg.DebugSandbox, { type: 'boolean', default: false, describe: 'Enable debug logging for sandbox operations' })
            .option(TroupeCliArg.DebugMailbox, { type: 'boolean', default: false, describe: 'Enable debug logging for mailbox processing' })
            .option(TroupeCliArg.DebugP2p, { type: 'boolean', default: false, describe: 'Enable debug logging for P2P communication' })
            .option(TroupeCliArg.Pini, { type: 'boolean', default: false, describe: 'Enable Pini mode for declassification' })
            .option(TroupeCliArg.ShowStack, { alias: 'ss', type: 'boolean', default: false, describe: 'Show stack traces on errors' })
            .option(TroupeCliArg.Trustmap, { alias: 'tm', type: 'string', describe: 'Path to the trustmap JSON file' })
            .option(TroupeCliArg.Id, { alias: 'i', type: 'string', describe: 'Path to the node ID file' })
            .option(TroupeCliArg.LocalOnly, { alias: 'l', type: 'boolean', default: false, describe: 'Run in local-only mode, skipping network creation' })
            .option(TroupeCliArg.Persist, { alias: 'P', type: 'boolean', default: false, describe: 'Enable persistence mode' })
            .option(TroupeCliArg.Aliases, { alias: 'a', type: 'string', describe: 'Path to the aliases JSON file' })
            .option(TroupeCliArg.Stdiolev, { type: 'string', describe: 'Security level for stdio operations' })
            .option(TroupeCliArg.Port, { type: 'number', describe: 'Network port for P2P communication' })
            .option(TroupeCliArg.File, { alias: 'f', type: 'string', describe: 'Path to the main troupe program file to execute' })
            .option(TroupeCliArg.RSpawn, { type: 'boolean', default: false, describe: 'Allow remote spawning of troupe processes' })
            .parseSync();

        if (rawArgs.f && !rawArgs.file) {
             rawArgs.file = String(rawArgs.f);
        }

        parsedArgs = rawArgs as ParsedArgs;
    }
    return parsedArgs;
} 