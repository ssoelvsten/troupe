

export class Category {
    labels: Set <string>
    constructor (l: Set <string>) {
        this.labels = l;
    }
}

export class CNF {
    categories: Set <Category>
    constructor(c: Set<Category>) {
        this.categories = c
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

export const CNF_TRUE : CNF = new CNF ( new Set() ); 
export const CNF_FALSE : CNF = new CNF ( new Set ([new Category(new Set())])) 

console.log ("CNF evaluated")