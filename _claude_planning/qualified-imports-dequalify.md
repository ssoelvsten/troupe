Go over the test corpus, and in all the places where 
the import is qualified but the libraries that are imported 
are obviously non-conflicting, or there is only one library being imported, remove the qualified import and also rewrite the program from `<lib>.foo` to just `foo`