# Cabal + GHCup Migration Plan

> *This document was generated with Claude Code on 2025-12-28.*

This document outlines a potential migration from Stack to Cabal + GHCup for the Troupe compiler build system.

## Current State

- **Build System**: Stack
- **Resolver**: lts-24.1 (GHC 9.10.x)
- **CI GHC Version**: 9.12.2 (via haskell-actions/setup)
- **Packages**: Single compiler package
- **Build Tools**: alex, happy (managed by Stack)

### Package Structure
- **Executables**: 4 (`troupec`, `dclabels`, `irtester`, `golden`)
- **Libraries**: Single library with ~32 source files
- **Tests**: 2 test suites (golden tests, IR transformation tests)
- **Dependencies**: ~20 standard Haskell packages
- **Generated Files**: Uses alex/happy for lexer/parser

## Benefits of Migration

- **Faster Builds**: Cabal builds are typically faster for projects this size
- **Reproducible Builds**: GHCup ensures exact same toolchain versions
- **Cross-Platform Consistency**: Same GHC/Cabal versions on Linux, macOS, Windows
- **Better CI/CD**: Improved caching and faster setup with GHCup GitHub Actions
- **Version Management**: Easy switching between GHC versions for testing

## Migration Overview

### Key Changes

| Component | Current (Stack) | Target (Cabal) |
|-----------|-----------------|----------------|
| Build tool | `stack build` | `cabal build all` |
| Install | `stack install` | `cabal install --installdir=../bin` |
| REPL | `stack ghci` | `cabal repl` |
| Test | `stack test` | `cabal test all` |
| Clean | `stack clean` | `cabal clean` |

### Makefile Updates

```makefile
# Current Stack-based
all:
	stack build $(STACK_OPTS)
	stack install --local-bin-path ../bin

# Target Cabal-based
all:
	cabal build all
	cabal install --install-method=copy --installdir=../bin all
```

### CI/CD Updates

The CI workflow would change from:

```yaml
- uses: haskell-actions/setup@v2
  with:
    ghc-version: '9.12.2'
    enable-stack: true
```

To:

```yaml
- uses: haskell-actions/setup@v2
  with:
    ghc-version: '9.12.2'
    cabal-version: '3.10'
    enable-stack: false
```

## Potential Issues

### 1. Alex/Happy Installation
- **Current**: Managed by Stack
- **Solution**: Install via GHCup or system package manager

### 2. Build Tool Changes
- **Impact**: All build commands need updating
- **Solution**: Update Makefiles, CI workflows, documentation

### 3. Version Pinning
- **Current**: Stack resolver pins all versions
- **Solution**: Use `cabal freeze` for reproducible builds

## Rollback Plan

If issues arise:
```bash
git checkout HEAD -- compiler/Makefile Makefile
cd compiler && make clear && make all
```

## Decision Criteria

Consider migration if:
- Build times with Stack become problematic
- Cross-platform reproducibility issues arise
- GHC version management becomes difficult

Current Stack setup is working. This migration is **optional** and should be evaluated based on actual pain points.

## Next Steps (If Proceeding)

1. Install GHCup and pin toolchain versions
2. Generate cabal file from package.yaml (if using hpack)
3. Update `compiler/Makefile` with Cabal commands
4. Update root `Makefile`
5. Test full build cycle
6. Update CI workflow
7. Update Docker configuration
8. Update documentation
