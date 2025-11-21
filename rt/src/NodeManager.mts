'use strict'

import * as fs from 'node:fs'
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
const argv = getCliArgs();


class Node {
    nodeId: string;
    constructor(nodeId) {
        this.nodeId = nodeId;
    }
}

class NodeManager {
    localNode: Node | null;
    aliases: {[x in string]: string};

    constructor () {
        let aliases = argv[TroupeCliArg.Aliases]
                        ? JSON.parse ( fs.readFileSync(argv[TroupeCliArg.Aliases] as string, 'utf8'))
                        : {}

        this.localNode = null;
        this.aliases = aliases;
    }

    setLocalPeerId (peerid: string | null)  {
        if (this.localNode != null) {
            console.log ("error: local port already set. quitting...");
            process.exit(1);
        }
        this.localNode = new Node (peerid);
    }

    getNodeId () {
        if (this.localNode.nodeId == null) {
            return "<local>"
        } 
        return this.localNode.nodeId
    }

    getNode(nodeName: string) {
        if (nodeName.startsWith ("@")) {
            nodeName = this.aliases[nodeName.substring(1)];
        }
        // TODO: error handling in case aliases are not available; 2020-01-31
        
        return new Node (nodeName);        
    }

    isLocalNode (id: string) {        
        if (id == "<null>") {
            return true;
        }
        // console.log ("local node id is ", this.localNode)
        if (this.localNode == undefined) {
            console.log("ERROR: local node undefined; should not happen")
            process.exit(1);
        }
        return this.localNode.nodeId == this.getNode(id).nodeId
    }

    // Another hack; 2018-03-10; aa
    getLocalNode() {
        if (this.localNode == undefined) {
            console.log("ERROR: local node undefined; should not happen")
            process.exit(1);
        }        
        return this.localNode;
    }
}

export let __nodeManager = new NodeManager()