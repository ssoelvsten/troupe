Prepare a skeleton Troupe example for programming communication between two nodes.
You can base it on the simple multinode echo example. Use the following details.


name: quarantine-echo-01.
number of nodes: 2.
initial code: just what's out there in the basic two node echo example.
trust between nodes in the trustmaps: asymmetric: the client trusts the server but the server does not trust the client.


For setting up the trust, we can either use a static approach, i.e., when the identity of
the server node is hardcoded in the trustmap, or we can do this programmatically. Please
suggest which of the options is the best.

The scenario we want to test is that the client trusts the server at some level, e.g., {alice}
sends to them information at that level. The server however does not trust the client at level
{alice}, so runtime trust-based downgrading of this information will take place.

We will be reworking the runtime mechanisms as we  develop this application, but we want to
start simply by just printing the level of the information that we receive. After that we will
explore possible ways to extend the example through a series of extensions that will
guide towards developing the meta-record (see section 6.3 in the pdf document of Troupe security model).

The rough plan is as follows (add these to the index document)


1. create a basic example skeleton

2. check what information for accessing the metadata information about messages we currently have 
   in our implementationb

3. extend the runtime and the frontend to support the record-based approach for metadata, including
   the quarantine protocol as  outtlined in 4.1.2 of the pdf on Troupe security model.

4. revisit the example

5. expand the example to support a gate call idiom from the literature on HiStar and Zagibeylo's papers.
   


