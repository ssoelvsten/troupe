import { DCLabel, IFC_TOP, IFC_BOT }
    from "../levels/DCLabels/dclabel.mjs";

function test1()  {
	console.log (IFC_BOT.flowsTo(IFC_TOP));
}

function test2() {
    const a = DCLabel.fromSingleTag ("alice");
    const b = DCLabel.fromSingleTag ("bob");
    const c = a.join (b);
    console.log (c.stringRep ());
}

function test3() {
    const a = DCLabel.fromSingleTag ("alice");
    const c = a.join (IFC_BOT);
    console.log (c.stringRep ());
}


function main () {
	test3();
}

main ();