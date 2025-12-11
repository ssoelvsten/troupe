import { getCliArgs, TroupeCliArg } from "../TroupeCliArgs.mjs";
import { mkLogger } from '../logger.mjs';

const argv = getCliArgs();

const logLevel = argv[TroupeCliArg.DebugP2p] ? 'debug' : 'info';
const logger = mkLogger ('p2p/errorHandlers', logLevel);

/**
 * Known errors are reported whereas unknown errors are reported and thrown.
 */
export function reportExpectedErrors(err, source: string = "unknown") {
    logger.debug(`Error source: ${source}`);
    if(err instanceof AggregateError) {
      for(const e of err.errors ) {
        // Breaks down aggregate errors to their components.
        reportExpectedErrors (e, source)
      }
    } else {
      if(err.name || err.code) {
        const errorId = err.name || err.code;
        switch (errorId) {
          case 'NetworkUnreachableError':
          case 'ENETUNREACH':
            logger.debug(`${err.toString()}`)
            break;
          case 'NotFoundError':
          case 'ENOTFOUND':
            logger.debug(`${err.toString()}`)
            break;
          case 'ConnectionResetError':
          case 'ECONNRESET':
            logger.debug(`${err.toString()}`)
            break;
          case 'TransportDialFailedError':
          case 'ERR_TRANSPORT_DIAL_FAILED':
            logger.debug(`${err.toString()}`)
            break;
          case 'AbortError':
          case 'ABORT_ERR':
            logger.debug(`${err.toString()}`)
            break;
          case 'ConnectionRefusedError':
          case 'ECONNREFUSED':
            logger.debug(`${err.toString()}`)
            break;
          case 'HopRequestFailedError':
          case 'ERR_HOP_REQUEST_FAILED':
            logger.debug(`${err.toString()}`)
            break;
          case 'NoDialMultiaddrsError':
          case 'ERR_NO_DIAL_MULTIADDRS':
            logger.debug(`${err.toString()}`)
            break;
          case 'EncryptionFailedError':
          case 'ERR_ENCRYPTION_FAILED':
            logger.debug(`${err.toString()}`)
            break;
          case 'NoValidAddressesError':
          case 'ERR_NO_VALID_ADDRESSES':
            logger.debug(`${err.toString()}`)
            break;
          case 'StreamResetError':
          case 'ERR_MPLEX_STREAM_RESET':
            logger.debug(`${err.toString()}`)
            break;
          case 'TimeoutError':
          case 'ERR_TIMEOUT':
            logger.debug(`${err.toString()}`);
            break;

          default:
            logger.error(`Unhandled error case with error identifier ${errorId}`)
            throw err;
        }
      } else {
        logger.error(`Unhandled general error case ${err}`)
        throw err;
      }
    }
}