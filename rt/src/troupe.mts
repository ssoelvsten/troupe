import { start } from './runtimeMonitored.mjs';
import { getRuntimeObject } from './SysState.mjs';
import path  from 'path';
// import yargs from 'yargs'
import fs from 'node:fs'
// let yargs = require('yargs');
// let fs = require('fs');
// import { hideBin } from 'yargs/helpers';
// const argv:any = yargs(hideBin(process.argv)).parse()
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
const argv = getCliArgs();

let p:any = argv[TroupeCliArg.File];
if (!p) {
    console.error("Error: -f/--file argument is required.");
    process.exit(1);
}
if (!path.isAbsolute(p)) {
    p = path.normalize(process.cwd() + "/" + p);
}
if (!fs.existsSync(p)) {
    console.error(`Cannot find file ${p}`);
    process.exit(1);
}
(async () => {
    let d = await import (p);
    let Top = d.default     
    let __userRuntime = (getRuntimeObject() as any).__userRuntime;
    let top = new Top(__userRuntime);
    start(top);

}) ()

