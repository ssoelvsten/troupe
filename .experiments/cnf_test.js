"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cnf_js_1 = require("./cnf.js");
function test1() {
    let cat1 = new cnf_js_1.Category(new Set(["Alice", "Bob"])); // Alice \/ Bob
    let cat2 = new cnf_js_1.Category(new Set(["Charlie"])); // Charlie
    let cnf1 = new cnf_js_1.CNF(new Set([cat1, cat2])); //  (Alice \/ Bob ) /\ Charlie 
    let cat3 = new cnf_js_1.Category(new Set(["Alice"]));
    let cnf2 = new cnf_js_1.CNF(new Set([cat1])); // Alice \/ Bob
    let cnf3 = new cnf_js_1.CNF(new Set([cat3])); // Alice 
    let cnf4 = new cnf_js_1.CNF(new Set([new cnf_js_1.Category(new Set(["Alice"])),
        new cnf_js_1.Category(new Set(["Bob"]))]));
    console.log((0, cnf_js_1.implies)(cnf4, cnf_js_1.CNF_TRUE));
    console.log((0, cnf_js_1.implies)(cnf_js_1.CNF_FALSE, cnf4));
}
function main() {
    test1();
}
main();
