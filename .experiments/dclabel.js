"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IFC_ALLTRUST = exports.IFC_NOTRUST = exports.IFC_TOP = exports.IFC_BOT = exports.DCLabel = void 0;
const cnf_js_1 = require("./cnf.js");
class Level {
}
class DCLabel {
    constructor(c, i) {
        this.confidentiality = c;
        this.integrity = i;
    }
    flowsTo(other) {
        /*
        S_2 ==> S1         I1 ==> I_2
        -------------------------------
        <S_1, I_1> flowsto <S_2, I_2>
        
        */
        return (0, cnf_js_1.implies)(other.confidentiality, this.integrity) &&
            (0, cnf_js_1.implies)(this.integrity, other.confidentiality);
    }
}
exports.DCLabel = DCLabel;
/*
⊤ = <False, True>  (least secret, most garbage)

<True, True>                      <False, False>  (most secret, most trusted)

⊥ = <True, False>  (most public, least garbage)
*/
exports.IFC_BOT = new DCLabel(cnf_js_1.CNF_TRUE, cnf_js_1.CNF_FALSE);
exports.IFC_TOP = new DCLabel(cnf_js_1.CNF_FALSE, cnf_js_1.CNF_TRUE);
exports.IFC_NOTRUST = new DCLabel(cnf_js_1.CNF_TRUE, cnf_js_1.CNF_TRUE);
exports.IFC_ALLTRUST = new DCLabel(cnf_js_1.CNF_FALSE, cnf_js_1.CNF_FALSE);
