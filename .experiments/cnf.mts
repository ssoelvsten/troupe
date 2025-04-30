import {CONJ_OPERATOR, CAT_DELIM_LEFT, CAT_DELIM_RIGHT, DISJ_OPERATOR} from './dcl_pp_config.mjs'

enum Delimiterification {
    None,
    AsNeeded, 
    Always
}

export class Category {
    labels: Set <string>
    constructor (l: Set <string>) {
        this.labels = l;
    }

    stringRep (parenthesize = Delimiterification.None) {
        let r = Array.from (this.labels.values()).join(DISJ_OPERATOR);  
        switch (parenthesize) {
            case Delimiterification.None:
                return r
            case Delimiterification.AsNeeded:
                if (this.labels.size > 1) {
                    return CAT_DELIM_LEFT + r + CAT_DELIM_RIGHT 
                } else 
                    return r;
            case Delimiterification.Always:
                return CAT_DELIM_LEFT + r + CAT_DELIM_RIGHT 
        } 
    }
}

export class CNF {
    categories: Set <Category>
    constructor(c: Set<Category>) {
        this.categories = c
    }

    stringRep () {
        return Array.from (
            this.categories.values().map (x => x.stringRep(Delimiterification.AsNeeded))).
            join (CONJ_OPERATOR)
    }
}

export function implies (X: CNF, Y: CNF): boolean {
    for (let y of Y.categories) y_loop: {
        for (let x of X.categories) {        
            let set_x: any = x.labels; 
            // console.log (x, " ?? ", y, " -- ", set_x.isSubsetOf (y.labels))
            if (set_x.isSubsetOf (y.labels) ) {
                break y_loop;
            }
        } 
        return false;
    }
    return true;
}

export function conjunction (X:CNF, Y:CNF): CNF {
    if (implies(X,Y)) {
        return Y
    }
    if (implies(Y,X)) {
        return X;
    }   
    return new CNF (X.categories.union (Y.categories))
}

export function disjunction (X:CNF, Y:CNF): CNF {
    if (implies (X,Y)) {
        return X;
    }
    if (implies (Y,X)) {
        return Y;
    }

    let newCategories:Set<Category> = new Set();

    for (const xCat of X.categories) {
        for (const yCat of Y.categories) {                        
            newCategories.add(new Category(xCat.labels.union (yCat.labels)));
        }
    }

    return new CNF(newCategories);
}

export const CNF_TRUE : CNF = new CNF ( new Set() ); 
export const CNF_FALSE : CNF = new CNF ( new Set ([new Category(new Set())])) 
