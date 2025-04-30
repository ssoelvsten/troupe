import { DCLabel, IFC_TOP, IFC_BOT } from "./dclabel.mjs"

function test1()  {
	console.log (IFC_BOT.flowsTo(IFC_TOP));
}


function main () {
	test1();
}

main ()