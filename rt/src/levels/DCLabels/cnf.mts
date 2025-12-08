import { CONJ_OPERATOR
       , CAT_DELIM_LEFT
       , CAT_DELIM_RIGHT
       , DISJ_OPERATOR
    //    , DC_EMPTY_CAT
       , Delimiterification
    //    , DC_DELIM_RIGHT
    //    , DC_DELIM_LEFT
    //    , DC_EMPTY_CNF 
    } from './dcl_pp_config.mjs'

export class Category {
    toJSON(): string[] {
        return [...this.labels];
    }

    static fromJSON (o: string[]) : Category {
        return new Category (new Set(o));
    }

    labels: Set<string>
    constructor(l: Set<string>) {
        this.labels = l;
    }

    stringRep(pp_empty_cat): string {
        if (this.labels.size == 0) {
            return pp_empty_cat;
        }
        let r = Array.from(this.labels.values()).join(DISJ_OPERATOR);
        return r;
    }

}

export class CNF {
    toJSON(): string[][] {
        return [...this.categories].map (x => x.toJSON())
    }

    static fromJSON (o: string[][]): CNF  {
        return (new CNF (new Set (o.map (x => Category.fromJSON(x)))))
    }

    categories: Set<Category>
    constructor(c: Set<Category>) {
        this.categories = c
    }

    equals(other: CNF): boolean {
        return implies(this, other) && implies(other, this);
    }

    stringRep(pp_literals, parenthesize = Delimiterification.AsNeeded): string {
        if (this.categories.size == 0) {
            return pp_literals.trueLit;
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
            let s: string = x.stringRep(pp_literals.falseLit);
            let q = p && (x.labels.size > 1)
            if (q) {
                return (CAT_DELIM_LEFT + s + CAT_DELIM_RIGHT)
            } else
                return s
        }

        return Array.from(
            this.categories.values().map(g)).
                sort((a,b) => a.localeCompare(b)).join(CONJ_OPERATOR)
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
        return X
    }
    if (implies(Y, X)) {
        return Y;
    }
    return new CNF(X.categories.union(Y.categories))
}

export function disjunction(X: CNF, Y: CNF): CNF {
    if (implies(X, Y)) {
        return Y;
    }
    if (implies(Y, X)) {
        return X;
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