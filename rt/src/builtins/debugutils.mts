import {UserRuntimeZero, Constructor, mkBase} from './UserRuntimeZero.mjs'
import { assertIsString, assertIsNumber, assertIsNTuple } from '../Asserts.mjs'
import { __unit } from '../UnitVal.mjs';
import { TroupeType } from '../TroupeTypes.mjs';
import Table from 'cli-table3';


export function BuiltinDebugUtils <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        _setProcessDebuggingName = mkBase((arg) => {
            assertIsString(arg)
            this.runtime.$t.processDebuggingName = arg.val
            return this.runtime.ret(__unit)
        })

        debugpc = mkBase((arg) => {
            this.runtime.debug("");
            // this.runtime.$t.showStack()
            return this.runtime.ret(__unit);
        }, "debugpc")

        _debug = mkBase ((arg) => {
            console.log (arg.stringRep(true))
            return this.runtime.ret(__unit);
        })

        _setFailureRate = mkBase((arg) => {
            let _tt = arg.getTroupeType;
            switch (_tt) {
                case TroupeType.NUMBER:
                    this.runtime.$t.failureRate = arg.val
                    this.runtime.$t.failureStartTime = 0;
                    break;
                case TroupeType.TUPLE:
                    assertIsNTuple(arg, 2)
                    assertIsNumber (arg.val[0])
                    assertIsNumber (arg.val[1])
                    this.runtime.$t.failureRate = arg.val[0].val
                    this.runtime.$t.failureStartTime = Date.now() + arg.val[1].val
                    break;
                default:
                    this.runtime.$t.threadError ("Invalid argument type in function _setFailureRate");
            }
            return this.runtime.ret(__unit);
        })

        debugMbox = mkBase((_arg) => {
            const thread = this.runtime.$t;
            const mailbox = thread.mailbox;
            const maxMessages = 10;

            const boxChars = {
                'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
                'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
                'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
                'right': '║', 'right-mid': '╢', 'middle': '│'
            };

            // Metadata table
            const metaTable = new Table({
                chars: boxChars,
                style: { head: [], border: [] },
                colWidths: [18, 60]
            });

            const mclear = mailbox.mclear;
            metaTable.push(
                [{ colSpan: 2, content: 'MAILBOX DEBUG INFO', hAlign: 'center' }],
                ['Thread ID', thread.tidErrorStringRep().substring(0, 57)],
                ['Total messages', String(mailbox.length)],
                ['Mbox clearance', mclear.stringRep().substring(0, 57)]
            );

            console.log("");
            console.log(metaTable.toString());

            if (mailbox.length === 0) {
                const emptyTable = new Table({
                    chars: boxChars,
                    style: { head: [], border: [] },
                    colWidths: [78]
                });
                emptyTable.push([{ content: '(mailbox is empty)', hAlign: 'center' }]);
                console.log(emptyTable.toString());
                console.log("");
                return this.runtime.ret(__unit);
            }

            // Show the last N messages (most recent)
            const startIdx = Math.max(0, mailbox.length - maxMessages);

            // Messages table
            const msgTable = new Table({
                chars: boxChars,
                style: { head: [], border: [] },
                head: ['#', 'Message Value', 'Label'],
                colWidths: [6, 50, null]  // null = auto-size for label
            });

            if (startIdx > 0) {
                msgTable.push([{ colSpan: 3, content: `(showing last ${maxMessages} of ${mailbox.length} messages)`, hAlign: 'center' }]);
            }

            for (let i = startIdx; i < mailbox.length; i++) {
                const mbVal = mailbox[i];
                let msgStr = mbVal.stringRep(true);
                if (msgStr.length > 47) {
                    msgStr = msgStr.substring(0, 44) + "...";
                }
                const levStr = mbVal.lev.stringRep();  // full label, no truncation
                msgTable.push([String(i), msgStr, levStr]);
            }

            console.log(msgTable.toString());
            console.log("");

            return this.runtime.ret(__unit);
        }, "debugMbox")
    }
}

