import { CONJ_OPERATOR
       , CAT_DELIM_LEFT
       , CAT_DELIM_RIGHT
       , DISJ_OPERATOR
       , DC_EMPTY_CAT
       , Delimiterification
       , DC_DELIM_RIGHT
       , DC_DELIM_LEFT
       , DC_EMPTY_CNF 
    } from './dcl_pp_config.mjs'

export class Category {
    labels: Set<string>
    constructor(l: Set<string>) {
        this.labels = l;
    }

    stringRep(): string {
        if (this.labels.size == 0) {
            return DC_EMPTY_CAT;
        }
        let r = Array.from(this.labels.values()).join(DISJ_OPERATOR);
        return r;
    }
}

export class CNF {
    categories: Set<Category>
    constructor(c: Set<Category>) {
        this.categories = c
    }

    stringRep(parenthesize = Delimiterification.AsNeeded): string {
        if (this.categories.size == 0) {
            return DC_EMPTY_CNF;
        }
        let p: boolean;
        switch (parenthesize) {
            case Delimiterification.AsNeeded:
                p = this.categories.size > 1;
                break;
            case Delimiterification.Always:
                p = true;
                break;
            case Delimiterification.None:
                p = false;
                break;
        }
        function g(x: Category): string {
            let s: string = x.stringRep();
            let q = p && (x.labels.size > 1)
            if (q) {
                return (CAT_DELIM_LEFT + s + CAT_DELIM_RIGHT)
            } else
                return s
        }

        return Array.from(
            this.categories.values().map(g)).join(CONJ_OPERATOR)
    }
}

export function implies(X: CNF, Y: CNF): boolean {
    for (let y of Y.categories) y_loop: {
        for (let x of X.categories) {
            let set_x: any = x.labels;
            // console.log (x, " ?? ", y, " -- ", set_x.isSubsetOf (y.labels))
            if (set_x.isSubsetOf(y.labels)) {
                break y_loop;
            }
        }
        return false;
    }
    return true;
}

export function conjunction(X: CNF, Y: CNF): CNF {
    if (implies(X, Y)) {
        return Y
    }
    if (implies(Y, X)) {
        return X;
    }
    return new CNF(X.categories.union(Y.categories))
}

export function disjunction(X: CNF, Y: CNF): CNF {
    if (implies(X, Y)) {
        return X;
    }
    if (implies(Y, X)) {
        return Y;
    }

    let newCategories: Set<Category> = new Set();

    for (const xCat of X.categories) {
        for (const yCat of Y.categories) {
            newCategories.add(new Category(xCat.labels.union(yCat.labels)));
        }
    }

    return new CNF(newCategories);
}

export const CNF_TRUE: CNF = new CNF(new Set());
export const CNF_FALSE: CNF = new CNF(new Set([new Category(new Set())])) 