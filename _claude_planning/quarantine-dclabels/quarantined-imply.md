In dclabel.mts, let's override the implication so that 
it takes an optional record of {node, allowMismatched}. 
Let's create a proper type wrapper for that record, because it may be 
convenient, and give it an appropriate name.

if this record is provided, we first call the restore cnf for that node
on both of the arguments and then check the implication on the restored labels.
we track the mismatched nodes that are returned from the restoration, 
and if allowMismatched is set to true, we proceed with the normal implication.

if not (which means we are working on this in the context of serialization), then 
we return false.

We also need to change how the implication works. 