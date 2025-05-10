import {Category, CNF, CNF_FALSE, CNF_TRUE, implies} from './DCLabels/cnf.mjs'
import { Delimiterification } from './DCLabels/dcl_pp_config.mjs';

function test1 () {
	let cat1 : Category = new Category (new Set (["Alice", "Bob"]) ) // Alice \/ Bob
	let cat2 : Category = new Category (new Set (["Charlie"]))      // Charlie
	let cnf1 : CNF = new CNF ( new Set ([cat1, cat2])) //  (Alice \/ Bob ) /\ Charlie 
	let cat3 : Category = new Category (new Set (["Alice"]));
	let cnf2 : CNF = new CNF ( new Set ([cat1]))   // Alice \/ Bob
	let cnf3 : CNF = new CNF ( new Set ([cat3]))   // Alice 
	let cnf4 : CNF = new CNF ( new Set ([new Category (new Set (["Alice"]))
					   , new Category (new Set (["Bob"  ]))]))
    
   
					   
	let cnfs = [cnf1, cnf2, cnf3, cnf4, CNF_TRUE, CNF_FALSE]
    
	// console.log ( implies (cnf4, CNF_TRUE))
	// console.log ( implies (CNF_FALSE, cnf4))

	cnfs.map ((x: CNF) => { console.log (x.stringRep(Delimiterification.AsNeeded))})
	cnfs.map ((x: CNF) => {
		 console.log (JSON.stringify(x.toJSON()))
	})
    }
    
function main () {
test1()
}

main () 