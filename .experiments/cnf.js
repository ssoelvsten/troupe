"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CNF_FALSE = exports.CNF_TRUE = exports.CNF = exports.Category = void 0;
exports.implies = implies;
class Category {
    constructor(l) {
        this.labels = l;
    }
}
exports.Category = Category;
class CNF {
    constructor(c) {
        this.categories = c;
    }
}
exports.CNF = CNF;
function implies(X, Y) {
    for (let y of Y.categories)
        y_loop: {
            for (let x of X.categories) {
                let set_x = x.labels;
                // console.log (x, " ?? ", y, " -- ", set_x.isSubsetOf (y.labels))
                if (set_x.isSubsetOf(y.labels)) {
                    break y_loop;
                }
            }
            return false;
        }
    return true;
}
exports.CNF_TRUE = new CNF(new Set());
exports.CNF_FALSE = new CNF(new Set([new Category(new Set())]));
console.log("CNF evaluated");
