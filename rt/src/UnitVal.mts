import {__unitbase} from './UnitBase.mjs';
import * as levels from './Level.mjs';
import { LVal } from './Lval.mjs';

export const __unit = new LVal (__unitbase, levels.BOT, levels.BOT);

