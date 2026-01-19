We will extend the DC Label model with quarantines.

1. Extend the notion of labels: right now it's a set of strings. Instead let's add a new class Label.
  A label is either a string (corresponding to a non-quarantined label) or a string with quarantine 
  tag that corresponds to a node and a quarantine tag (will likely be string originating from a uuid), 
  or `qfalse` - a special label corresponding to the case when we quarantine false, which is a special 
  value distinct from others, also tagged with node and a quarantine tag. 


2. Make sure we support this and everything else in the system is extended to support this refactoring. 

additional guidelines

- serialization of quarantined labels is constrained:

  - when sending data to another node, if the node matches the quarantine node, we restore the original label
  - otherwise we disallow sending quarantined labels to other nodes

This means that some of the deserialization logic needs to take into account the information about the node to which we are sending this. 

For persisting quarantined information it also means that we cannot persist it.


The notion of quarantine authority now needs to change to use. The only kind of quarantine labels that should appear in the authority is the quarantined false; and it can be used to downgrade of the quarantined labels of the form `alice@node:tag`. 

- we need to extend the implication of the DC labels to support this.