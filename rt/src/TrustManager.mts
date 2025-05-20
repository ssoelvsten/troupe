import * as levels from "./options.mjs";
import yargs from "yargs";
import * as fs from 'node:fs';
import { Level } from "./Level.mjs";
import { __nodeManager } from "./NodeManager.mjs";
const { readFile } = fs.promises


import { hideBin } from 'yargs/helpers';
const argv:any = yargs(hideBin(process.argv)).parse()

let logLevel = argv.debug ? 'debug' : 'info';
import { mkLogger } from './logger.mjs'
const logger = mkLogger('RTM', logLevel);


export let _trustMap = {}

async function loadTrustMap(trustMapFile) {
    try {
        let s = await readFile(trustMapFile, 'utf-8');
        let trustList = JSON.parse(s);
        let trustMap = {}
        trustList.map(x => trustMap[x.id] = levels.mkLevel(x.level));
        _trustMap = trustMap;
    } catch (err) {
        logger.error("cannot load trust map file: " + err);
    }
}


export async function initTrustMap() {
    if (argv.trustmap) {
        await loadTrustMap(argv.trustmap);
    } else {
        let default_trustmap = "trustmap.json"
        if (fs.existsSync(default_trustmap)) {
            await loadTrustMap(default_trustmap)
        }
    }

}


export function nodeTrustLevel(nodeid):Level {
    if (__nodeManager.isLocalNode(nodeid)) {
        return levels.TOP
    }
    if (_trustMap) {
        // console.log ("true");
        return _trustMap[nodeid] ? _trustMap[nodeid] : levels.BOT;
    }
    return levels.BOT;
}