module ProcessImports (processImports) where
import Basics
import Direct
import System.Environment
import System.Exit
import System.Directory (doesFileExist)
import Data.String.Utils 

defaultLibFolder="/lib/out/" 
defaultBin="/bin/troupec"

-- Try to get home from executable path (returns Nothing if not possible)
tryGetRelativeHome :: IO (Maybe String)
tryGetRelativeHome = do
   progPath <- getExecutablePath
   if endswith defaultBin progPath
   then do
       let home = take (length progPath - length defaultBin) progPath
       markerExists <- doesFileExist (home ++ "/.troupe-root")
       if markerExists then return (Just home) else return Nothing
   else return Nothing

getTroupeHome :: IO String
getTroupeHome = do
  -- Try self-location first (for worktree support)
  selfLocated <- tryGetRelativeHome
  case selfLocated of
      Just home -> return home
      Nothing -> do
          -- Fall back to TROUPE env var
          maybeVar <- lookupEnv "TROUPE"
          case maybeVar of
              Just troupeEnv -> return troupeEnv
              Nothing -> die "Cannot determine Troupe home folder. Consider setting up the TROUPE environment variable" 
      


processImport :: ImportDecl -> IO ImportDecl
processImport imp = do
  troupeEnv <- getTroupeHome
  let LibName lib = importLib imp
  let fname = troupeEnv ++ defaultLibFolder ++ lib ++ ".exports"
  input <- readFile fname
  let exports = lines input
  -- Validate selective imports if specified
  case importSelected imp of
    Just selected -> do
      let missing = filter (`notElem` exports) selected
      if null missing
        then return imp { importExports = Just exports }
        else die $ "Library '" ++ lib ++ "' does not export: " ++ unwords missing
    Nothing -> return imp { importExports = Just exports }


processImports' :: Imports -> IO Imports
processImports' (Imports imports)=
  Imports <$> mapM processImport imports


processImports :: Prog -> IO Prog
processImports (Prog imports atoms term) = do
  imports' <- processImports' imports
  return $ Prog imports' atoms term


-- TODO: 2018-07-02: AA: proper error handling in case we have errors
-- loading information from the lib files
