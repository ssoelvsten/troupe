import { DCLabel, IFC_TOP, IFC_BOT } 
    from "../levels/DCLabels/dclabel.mjs"

function test1()  {
	console.log (IFC_BOT.flowsTo(IFC_TOP));
}

function test2() {
    let a = DCLabel.fromSingleTag ("alice")
    let b = DCLabel.fromSingleTag ("bob")
    let c = a.join (b); 
    console.log (c.stringRep ());
}

function test3() {
    let a = DCLabel.fromSingleTag ("alice")
    let c = a.join (IFC_BOT); 
    console.log (c.stringRep ());
}


function main () {
	test3();
}

main ()