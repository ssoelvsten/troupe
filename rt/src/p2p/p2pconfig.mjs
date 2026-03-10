'use strict'
const P2PCONFIG_FILE = 'p2pconfig.json'
let logger;
(async() => {
    let { mkLogger } = await import ('../logger.mjs');
    logger = mkLogger ('p2p-config','info');
})()

import { existsSync, readFileSync } from 'fs';
let relays


// TODO: change the relay address to be the actual address
let default_relays = []
  // ["/dns4/relay.troupe-lang.net/tcp/5555/p2p/QmcQpBNGULxRC3QmvxVGXSw8BarpMvdADYvFtmvKAL5QMe"]
  // TODO: dns resolution of the relay has stopped working
  // ["/ip4/134.209.92.133/tcp/5555/ws/p2p/12D3KooWShh9qmeS1UEgwWpjAsrjsigu8UGh8DRKyx1UG6HeHzjf"]
  
let known_nodes = [
    {nodeid:"QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN", ip: "/dnsaddr/bootstrap.libp2p.io"},
    {nodeid:"QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa", ip: "/dnsaddr/bootstrap.libp2p.io"},
    {nodeid:"QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb", ip: "/dnsaddr/bootstrap.libp2p.io"},
    {nodeid:"QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt", ip: "/dnsaddr/bootstrap.libp2p.io"},
    {nodeid:"QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ", ip: "/ip4/104.131.131.82/tcp/4001"}
]
  

if (existsSync(P2PCONFIG_FILE)) {
  try {
    let s = readFileSync(P2PCONFIG_FILE) 
    let o = JSON.parse (s);
    if (o.relays) {      
      relays = o.relays
    } else {
      throw new Error ("relays field undefined")
    }
  } catch (err) {
    logger.error ("error parsing p2p configuration file")    
    relays = default_relays
  }
} else {
  relays = default_relays
}

let cliRelays = null;

export function setCliRelays(relayAddresses) {
  if (relayAddresses && relayAddresses.length > 0) {
    cliRelays = relayAddresses;
    logger?.info(`Using CLI-provided relay addresses: ${relayAddresses.join(', ')}`);
  }
}

export function getRelays() {
  // CLI relays take precedence
  if (cliRelays && cliRelays.length > 0) {
    return cliRelays;
  }
  // Otherwise use file-based or default relays
  return relays;
}

export default { relays: getRelays(), known_nodes, setCliRelays, getRelays }
