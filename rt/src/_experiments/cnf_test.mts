import {Category, CNF, CNF_FALSE, CNF_TRUE, implies} from '../levels/DCLabels/cnf.mjs'
import { DC_CONF_LITERALS } from '../levels/DCLabels/dcl_pp_config.mjs';
import { RegularLabel } from '../levels/DCLabels/label.mjs';

function test1 () {
	let cat1 : Category = new Category ([new RegularLabel("Alice"), new RegularLabel("Bob")]) // Alice \/ Bob
	let cat2 : Category = new Category ([new RegularLabel("Charlie")])      // Charlie
	let cnf1 : CNF = new CNF ( new Set ([cat1, cat2])) //  (Alice \/ Bob ) /\ Charlie
	let cat3 : Category = new Category ([new RegularLabel("Alice")]);
	let cnf2 : CNF = new CNF ( new Set ([cat1]))   // Alice \/ Bob
	let cnf3 : CNF = new CNF ( new Set ([cat3]))   // Alice
	let cnf4 : CNF = new CNF ( new Set ([new Category ([new RegularLabel("Alice")])
					   , new Category ([new RegularLabel("Bob")])]))



	let cnfs = [cnf1, cnf2, cnf3, cnf4, CNF_TRUE, CNF_FALSE]

	// console.log ( implies (cnf4, CNF_TRUE))
	// console.log ( implies (CNF_FALSE, cnf4))

	cnfs.map ((x: CNF) => { console.log (x.stringRep(DC_CONF_LITERALS))})
	cnfs.map ((x: CNF) => {
		 console.log (JSON.stringify(x.toJSON()))
	})
    }

function main () {
test1()
}

main ()
