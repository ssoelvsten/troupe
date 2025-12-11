'use strict'

import { mkLogger } from '../logger.mjs';
import { existsSync, readFileSync } from 'fs';

import { getCliArgs, TroupeCliArg } from '../TroupeCliArgs.mjs';

const logger = mkLogger ('p2p-config','info');

const argv = getCliArgs();

/** Name of the configuration file.
 *
 * @todo Merge this with the CLI arguments? That is, make the CLI argument the path to this file?
 */
const CONFIG_FILE = 'p2pconfig.json';

// -------------------------------------------------------------------------------------------------
// Port and Identifier

/** Port to listen on. If a value is not provided by the CLI, then port 0, is used (i.e. whichever
 *  is picked by the operating system). */
export const port: number = argv[TroupeCliArg.Port] || 0;

/** Identifier *string* to be used for the node. This value might be `null` if an arbitrary node
 *  identifier should be used.
 */
export const id: string | null = (() => {
  const idFile = argv[TroupeCliArg.Id];
  if (!idFile || !existsSync(idFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(idFile, "utf-8"));
  } catch (err) {
    logger.error("cannot load id file");
    process.exit(1);
  }
})();

// -------------------------------------------------------------------------------------------------
// Bootstrapping Nodes

/** List of libp2p nodes that should be used as part of the bootstrapping process.
 *
 *  The list is obtained from this libP2P guide.
 *  https://github.com/libp2p/js-libp2p/blob/b36ec7f24e477af21cec31effc086a6c611bf271/examples/discovery-mechanisms/README.md?plain=1#L60
 */
export const bootstrappers = [
  '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmZa1sAxajnQjVM8WjWXoMbmPd7NsWhfKsPkErzpm9wGkp',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
];

// -------------------------------------------------------------------------------------------------
// Known Nodes

/** Hardcoded known peers in the network.
 *
 * @todo Go through these and check whether they actually are still used.
 */
export const knownNodes = [
    {nodeid:"QmXfj4ysaS4pARJU5uUP59B47aCQP6X6FH6cm5otLhcMPa", ip: "/ip4/134.209.90.7/tcp/6789"},
    {nodeid:"QmNUiTnU1J5rNFtGXUfZJzSmx2GahSFCPjeSfSTbGoAR4q", ip: "/ip4/142.93.235.197/tcp/6789"},
    {nodeid:"QmW3oruhRQEuZXCtFWUEwE6DT1WyvifcR6YYtBEK6QTsMo", ip: "/ip4/167.71.68.246/tcp/6789"},
    {nodeid:"QmYHExHtTzFEjdwyQcJkD9gaKKgfwvGswoFb4simrJn5Q6", ip: "/ip4/188.166.69.210/tcp/6789"},
    {nodeid:"QmcRfB3SJp92t7GMgS5rygXuSDPm7q31GeAdP8q9HutyYT", ip: "/ip4/128.199.61.30/tcp/6789"},
    {nodeid:"QmSyj7FUykAhog46qDekYKjWDF4Y4PhPbP2hDkEmwz679b", ip: "/ip4/142.93.234.253/tcp/6789"},
    {nodeid:"QmS9tkoqKEPrfgsGMhqQgNT1pcZjCq1XRonUiR9uXEoj9e", ip: "/ip4/188.166.70.113/tcp/6789"},
    {nodeid:"QmYVDakQNvBhVCHeu1JCHJYc2sG1ESBwC3PB1vNzAFJWbH", ip: "/ip4/128.199.41.250/tcp/6789"},
    {nodeid:"QmX2edVZhWVa9Q6gbpwNZJGXqeLgcAvAYTga2m25dwWudH", ip: "/ip4/188.166.70.132/tcp/6789"},
    {nodeid:"QmbkpnNgD8uu9FArPPyzYUYuuVZtCo7n3jQ5Rz2nqiZEWD", ip: "/ip4/167.71.76.8/tcp/6789"},
    {nodeid:"QmYFdcq31Gnch87kkqFjWt5R1GH8jTPNspz5XxBzC6hJ1r", ip: "/ip4/104.248.86.46/tcp/6789"}
]

// -------------------------------------------------------------------------------------------------
// Relay

/** List of default relay servers.
 *
 * @todo The address below is for an old Troupe relay that is not operational anymore.
 *
 * @todo DNS resolution of the relay has stopped working. Previously, we could use the address
 *       '/dns4/relay.troupe-lang.net/...' and change the actual IP without updating the source code.
 */
const defaultRelays : string[] = [
  "/ip4/134.209.92.133/tcp/5555/ws/p2p/12D3KooWShh9qmeS1UEgwWpjAsrjsigu8UGh8DRKyx1UG6HeHzjf"
];

/** List of relay servers as provided in the configuration file. */
const configRelays : string[] = (() => {
  if (!existsSync(CONFIG_FILE)) { return []; }

  try {
    const s = readFileSync(CONFIG_FILE, "utf8");
    const o = JSON.parse(s);

    if (!o.relays) {
      logger.error ("p2p configuration file does not contain 'relays'")
      return [];
    }
    return o.relays;
  } catch (err) {
    logger.error ("error parsing p2p configuration file")
    return [];
  }
})();

/** List of relay servers as provided through the CLI. */
const cliRelays : string[] = (() => {
  const arg = argv[TroupeCliArg.Relay];
  if (!arg) { return []; }

  const args = Array.isArray(arg) ? arg : [arg];
  logger?.info(`Using CLI-provided relay addresses: ${args.join(', ')}`);
  return args;
})();

/** List of relay servers to use. */
export const relays : string[] = (() => {
  if (cliRelays.length > 0) { return cliRelays; }
  if (configRelays.length > 0) { return configRelays; }
  return defaultRelays;
})();
