module CompileMode where

-- | Different modes of compilation.
data CompileMode = -- | Compilation of a single file for a Troupe program
                   Normal
                   -- | Compiling a libary (deprecated)
                 | Library
                   -- | Compiling a module
                 | Module
                   -- | Interactive deserialization of IR
                 | Interactive
