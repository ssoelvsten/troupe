{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import qualified AtomFolding as AF
import Parser
import qualified Direct
import qualified Basics as Basics
import qualified Core as Core
import RetDFCPS
import qualified CaseElimination as C
import System.Environment
import Util.FileUtil
import qualified ClosureConv as CC
import qualified IR as CCIR
import qualified IROpt
-- import qualified RetRewrite as Rewrite
import qualified CPSOpt as CPSOpt
import qualified IR2Raw
import qualified Raw2Stack
import qualified Stack
import qualified Stack2JS
import qualified RawOpt
-- import System.IO (isEOF)
import qualified Data.ByteString.Char8 as BS
import Data.ByteString.Base64 (decode, encode)
import qualified Data.ByteString.Lazy.Char8 as BSLazyChar8
import System.IO
import System.Exit
import ProcessImports
import AddAmbientMethods
import ShowIndent
import Exports
import CompileMode
import Control.Monad.Except
import Control.Monad (when, filterM)
import System.Console.GetOpt
import qualified Data.Text as Text
import qualified Data.Text.Encoding as TextEncoding
import Data.List as List
import Data.Maybe (fromJust)
import System.Directory
import System.FilePath
import qualified Crypto.Hash.SHA256 as SHA256

--------------------------------------------------------------------------------
----- COMPILER FLAGS -----------------------------------------------------------

data Flag
  = TextIRMode
  | JSONIRMode
  | LibMode
  | Include String
  | Module
  | NoRawOpt
  | OutputFile String
  | Verbose
  | Help
  | Debug
  deriving (Show, Eq)

options :: [OptDescr Flag]
options =
  [ Option ['i'] ["text-ir"]   (NoArg TextIRMode)         "ir interactive mode (text)"
  , Option ['j'] ["json-ir"]   (NoArg JSONIRMode)         "ir interactive mode (json)"
  , Option []    ["no-rawopt"] (NoArg NoRawOpt)           "disable Raw optimization"
  , Option ['v'] ["verbose"]   (NoArg Verbose)            "verbose output"
  , Option ['d'] ["debug"]     (NoArg Debug)              "debugging information in the .js file"
  , Option ['l'] ["lib"]       (NoArg LibMode)            "compiling a library"
  , Option []    ["add-module-search-dir"] (ReqArg Main.Include "DIR") "directory for required modules"
  , Option []    ["module"]    (NoArg  Main.Module)       "compile as a module"
  , Option ['h'] ["help"]      (NoArg Help)               "print usage"
  , Option ['o'] ["output"]    (ReqArg OutputFile "FILE") "output FILE"
  ]

--------------------------------------------------------------------------------
----- PIPELINE FROM FLAGS TO IR AND JS -----------------------------------------

process :: [Flag] -> Maybe String -> String -> IO ExitCode
process flags fname input = do
  let ast = parseProg input

  let compileMode = if Main.LibMode `elem` flags then CompileMode.Library else
                    if Main.Module  `elem` flags then CompileMode.Module
                    else CompileMode.Normal

  let verbose = Verbose `elem` flags
      noRawOpt = NoRawOpt `elem` flags
      debugJS = Debug `elem` flags

  case ast of
    Left err -> do
      die $ "Parse Error:\n" ++ err

    Right prog_parsed -> do
      let outPath = outFile flags (fromJust fname)

      -- To print all tokens from the parser, uncomment the following line:
      -- debugTokens (Right tks) = mapM_ print tks

      ------------------------------------------------------
      -- TROUPE (FRONTEND) ---------------------------------
      let prog_without_dependencies =
            case compileMode of CompileMode.Normal -> addAmbientMethods prog_parsed
                                _                  -> prog_parsed

      prog_with_libs          <- processImports prog_without_dependencies
      prog_with_libs_and_mods <- (processModules $ includeDirs flags) prog_with_libs

      let prog = prog_with_libs_and_mods

      exports <- case compileMode of Library -> case runExcept (extractExports prog) of
                                                     Right es -> return (Just (es))
                                                     Left s   -> die s
                                     _       -> return Nothing

      when verbose $ do printSep "SYNTAX"
                        writeFileD "out/out.syntax" (showIndent 2 prog)
                        putStrLn (showIndent 2 prog)
      ------------------------------------------------------
      prog' <- case runExcept (C.trans compileMode (AF.visitProg prog)) of
        Right p -> return p
        Left s -> die s
      when verbose $ do printSep "PATTERN MATCH ELIMINATION"
                        writeFileD "out/out.nopats" (showIndent 2 prog')
      ------------------------------------------------------
      let lowered = Core.lowerProg prog'
      when verbose $ do printSep  "LOWERING FUNS AND LETS"
                        writeFileD "out/out.lowered" (showIndent 2 lowered)
      ------------------------------------------------------
      let renamed = Core.renameProg lowered
      when verbose $ do printSep "α RENAMING"
                        writeFileD "out/out.alpha" (showIndent 2 renamed)
      ------------------------------------------------------
      let cpsed = RetDFCPS.transProg renamed
      when verbose $ do printSep "CPSED"
                        writeFileD "out/out.cps" (showIndent 2 cpsed)
      ------------------------------------------------------
      let rwcps = CPSOpt.rewrite cpsed
      when verbose $ do printSep  "REWRITING CPS"
                        writeFileD "out/out.cpsopt" (showIndent 2 rwcps)

      ------------------------------------------------------
      ------ IR (BACKEND) ----------------------------------
      ir <- case runExcept (CC.closureConvert compileMode rwcps) of 
          Right ir -> return ir 
          Left  s -> die $ "troupec: " ++ s

      when verbose $ writeFileD "out/out.ir" (show ir)

      let iropt = IROpt.iropt ir 
      when verbose $ writeFileD "out/out.iropt" (show iropt)

      let iroptSerialized = CCIR.serializeProgram iropt
      let iroptHash       = SHA256.hash (iroptSerialized)

      case compileMode of CompileMode.Module -> writeModule outPath iroptSerialized iroptHash
                          _                  -> return ()

      ------ RAW -------------------------------------------
      let raw = IR2Raw.prog2raw iropt
      when verbose $ printSep  "GENERATING RAW"
      when verbose $ writeFileD "out/out.rawout" (show raw)

      ----- RAW OPT ----------------------------------------
      rawopt <- do
        if noRawOpt
        then return raw
        else do
          let opt = RawOpt.rawopt raw
          when verbose $ printSep  "OPTIMIZING RAW OPT"
          when verbose $ writeFileD "out/out.rawopt" (show opt)
          return opt

      ----- STACK ------------------------------------------
      let stack = Raw2Stack.rawProg2Stack rawopt
      when verbose $ printSep "GENERATING STACK"
      when verbose $ writeFileD "out/out.stack" (show stack)

      ----- JAVASCRIPT -------------------------------------
      let stackjs = Stack2JS.stack2JSString compileMode
                                            debugJS
                                            (iroptSerialized, iroptHash)
                                            (Stack.ProgramStackUnit stack)

      when verbose $ do printSep  "GENERATING JAVASCRIPT"
                        writeFileD "out/out.js" stackjs

      writeFile outPath stackjs

      -- case compileMode of Library -> ...
      case exports of Nothing -> return ()
                      Just es -> writeExports outPath es

      ----- EPILOGUE --------------------------------------
      when verbose printHr
      exitSuccess

-- TODO: 'where' for all helper functions below?

-- Obtain the name of the output file
outFile :: [Flag] -> String -> String
outFile flags fname = case List.find isOutFlag flags of
                          Just (OutputFile s) -> s
                          _ -> if Main.LibMode `elem` flags || Main.Module `elem` flags
                               then defaultName fname <.> "js"
                               else "out" </> "out" <.> "stack" <.> "js"
  where isOutFlag (OutputFile _) = True
        isOutFlag _              = False

        defaultName f = (takeDirectory f)
          </> "out"
          </> (if takeExtension f == ".trp" then takeBaseName else takeFileName) f

-- Obtain the list of directories to look up required modules.
-- TODO: Remove LibMode => Add 'lib/' folder (as in `src/ProcessImports`)
includeDirs :: [Flag] -> [String]
includeDirs flags = List.foldl mapDir [] flags
  where mapDir y (Include x) = x:y
        mapDir y _           = y

-- Given the include directories and the program, we attempt to find the corresponding '.ir'/'.hash'
-- file for each module that was 'required'. If succesful, the program is updated to include these
-- hashes.
processModules :: [String] -> Direct.Prog -> IO Direct.Prog
processModules paths (Direct.Prog imports (Basics.Modules m) atoms term) = do
  let paths' = paths >>= (\p -> [p, p </> "out"])
  modules' <- Basics.Modules <$> mapM (processModule paths') m
  return $ Direct.Prog imports modules' atoms term
  where processModule paths' (Basics.ModName n, _) = do
          matches <- filterM doesFileExist $ List.map (\p -> p </> n <.> "hash") paths'

          match <- case matches of
                     x:_ -> return x
                     []  -> die $ "Could not find module: '" ++ n ++ "'"

          matchContent  <- readFile match
          let matchContent' = lines matchContent

          hash <- case matchContent' of
                    x:_ -> return x
                    [] -> die $ "File '" ++ match ++ "' is empty"

          return $ ((Basics.ModName n), (Just $ Basics.ModHash $ hash))

-- Output to disk the intermediate representation and its hash of a Troupe program
writeModule path prog hash =
  let path'    = if takeExtension path == ".js" then dropExtension path else path
  in do
    writeFileD (path' ++ ".ir") (pickle prog)
    writeFileD (path' ++ ".hash") (pickle hash)
  where pickle = Text.unpack . TextEncoding.decodeUtf8 . encode

-- Output to disk the list of exported values/functions of a Troupe library
-- TODO: Remove LibMode => Remove
writeExports path exports =
  let path' = if takeExtension path == ".js" then dropExtension path else path
  in writeFileD (path' ++ ".exports") (intercalate "\n" exports)

-- Utility functions for printing things out
hrWidth = 70

printSep :: String -> IO ()
printSep s = do
  let prefix = replicate 5 '-'
      suffix = replicate (hrWidth - length s - 5 - 2) '-'
      s' = prefix ++ " " ++ s ++ " " ++ suffix
  putStrLn s'


printHr :: IO ()
printHr = putStrLn (replicate hrWidth '-')

--------------------------------------------------------------------------------
----- DESERIALIZATION FOR INTERACTIVE MODES ------------------------------------

fromStdinIR putStrLn format = do
  eof <- isEOF
  if eof then exitSuccess else do
    input <- BS.getLine
    let echo = "!ECHO "
    if BS.isPrefixOf echo input
    then let response = BS.drop (BS.length echo) input
          in do BS.putStrLn response
    else
      case decode input of
        Right bs ->
           case CCIR.deserialize bs
              of Right x -> do (putStrLn . (format (bs, SHA256.hash bs)) . ir2Stack) x
                 Left s -> do putStrLn "ERROR in deserialization"
                              debugOut $ "deserialization error" ++ s
        Left s -> do putStrLn "ERROR in B64 decoding"
                     debugOut $ "decoding error" ++s
    putStrLn "" -- magic marker to be recognized by the JS runtime; 2018-03-04; aa
    hFlush stdout
    fromStdinIR putStrLn format
  -- AA: 2018-07-15: consider timestamping these entries
  where debugOut s = appendFile "/tmp/debug" (s ++ "\n")

        ir2Stack = Raw2Stack.raw2Stack . RawOpt.rawopt . IR2Raw.ir2raw

fromStdinTextIR =
  let format = Stack2JS.stack2JSString CompileMode.Normal False
  in fromStdinIR putStrLn format

fromStdinJsonIR =
  let putStrLn = BSLazyChar8.putStrLn
      format   = Stack2JS.stack2JSON CompileMode.Normal False
  in fromStdinIR putStrLn format

--------------------------------------------------------------------------------
----- MAIN ---------------------------------------------------------------------

main :: IO ExitCode
main = do
  args <- getArgs
  case getOpt Permute options args of

-- AA: 2018-07-15: disabling REPL as it is pretty useless for now
--    ([],[],[]) -> repl

    ([Help], [], []) -> do
      putStrLn compilerUsage
      exitSuccess

    ([TextIRMode], [], []) -> fromStdinTextIR
    ([JSONIRMode], [], []) -> fromStdinJsonIR

    (o, [file], []) | optionsOK o -> do
      input <- readFile file
      process o (Just file) input

    (_,_, errs) -> die $ concat errs ++ compilerUsage
 where
   compilerUsage = usageInfo header options
     where header = "Usage: <compiler> [OPTION...] file"

   -- Check options for consistency
   optionsOK :: [Flag] -> Bool
   optionsOK o | length o >=2 =
                -- certain options must not be combined
                not.or $ map (`elem` o) [TextIRMode, Help]
   optionsOK _ = True
