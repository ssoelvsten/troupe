import {Category, CNF, CNF_FALSE, CNF_TRUE, implies} from '../levels/DCLabels/cnf.mjs';
import { Delimiterification } from '../levels/DCLabels/dcl_pp_config.mjs';

function test1 () {
	const cat1 : Category = new Category (new Set (["Alice", "Bob"]) ); // Alice \/ Bob
	const cat2 : Category = new Category (new Set (["Charlie"]));      // Charlie
	const cnf1 : CNF = new CNF ( new Set ([cat1, cat2])); //  (Alice \/ Bob ) /\ Charlie
	const cat3 : Category = new Category (new Set (["Alice"]));
	const cnf2 : CNF = new CNF ( new Set ([cat1]));   // Alice \/ Bob
	const cnf3 : CNF = new CNF ( new Set ([cat3]));   // Alice
	const cnf4 : CNF = new CNF ( new Set ([new Category (new Set (["Alice"]))
					   , new Category (new Set (["Bob"  ]))]));



	const cnfs = [cnf1, cnf2, cnf3, cnf4, CNF_TRUE, CNF_FALSE];

	// console.log ( implies (cnf4, CNF_TRUE))
	// console.log ( implies (CNF_FALSE, cnf4))

	cnfs.map ((x: CNF) => { console.log (x.stringRep(Delimiterification.AsNeeded));});
	cnfs.map ((x: CNF) => {
		 console.log (JSON.stringify(x.toJSON()));
	});
    }

function main () {
test1();
}

main ();