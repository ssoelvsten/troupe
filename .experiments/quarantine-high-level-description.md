# Quarantining principles

## Quarintining on ingress

Quarantining happens when a node with low trust sends us information with 
labels that exceed our trust on them. Quarantining is defined only 
for nodes with _regular_ trust, which means the nodes with trust label 
`<C_n, I_n>` such that `I_ <=> C_n`.

These are the quarantining possibilities

## Claim is within the trust 


```

I_n <==> C_n
           
 ||       ||
 \/       \/

 I  ==>   C

```

In this case, the claimed labels C; I are taken as they are


## Full overclaim

```

I_n  <==> C_n
  |       |
  ?       ?
  |       |
  I   =>  C

```

Here the question marks mean that we do have `I_n => I` (and the same for `C_n`
and `C`).

In this case, we produce a pair of quarantined labels `<C@n:q, I@n:q>` where
`n` is the node, and `q` is the quarantine tag.

(from the perspective of the runtime this means that we have enough assurance
about the provenance of this information and that it is therefore sufficient
for us to just keep the node provenance information internally).


## Integrity overclaim

```

I_n  <==> C_n
           
          ||
  ?       \/
  
  I   =>  C

```

We consult the node setting for `INTEGRITY_ONLY_DISTRUST` (we should look for a
better name). If the setting is `RAISE_TAINT`, then we relabel I to  `I_n`. 
If the setting is `QUARANTINE`, then we quarantine both I and C as in the
full overclaim. 

## Quarantine authority

When data is quaratined, we include the quarantine authority as part of the 
message meta-data. Quarantine authority is authority to downgrade information 
labeled with up to {false:n:q}. 


## Managing quarantined data

The following enforcement principles apply to the quarantined data

1. Quarantined labels remains local to the node.

2. Internally, quarantined labels propagate within the node just 
   like any other information. If sending quarantine information to another node, 
   we can reverse the quarantine, by providing the necessary quarantine authority. 

   It could be either a quarantine authority obtained via metadata (or a
   coalescing of them).

   To support reverse quarantining, we want to overload the send primitive 
   to support the 3-tuple argument, `send (pid, v, qauth)` where `qauth` 
   is the quarantine authority. 
    
## Engineering

1. implement the partial quarantineening.
2. re-factor the send primitive.
