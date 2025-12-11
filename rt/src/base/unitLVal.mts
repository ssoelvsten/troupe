import RawUnit from './RawUnit.mjs'
import { BOT } from '../Level.mjs';
import { LVal } from './LVal.mjs';

/** The (singleton) `LVal<RawUnit>` value.
 *
 * @deprecated Use `mkUnit()` in lvalUtil.mts instead.
 */
export const unitLVal = new LVal (RawUnit, BOT, BOT)

