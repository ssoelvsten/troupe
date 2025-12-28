# Tier 4: Rollup Plugin Migration

**Status**: ✅ COMPLETE (2025-12-27, commit 893aa84)

**Risk Level**: Medium
**Effort**: Moderate
**Dependencies**: Tier 1 recommended first

## Overview

The current rollup plugins are deprecated and need to be replaced with their official `@rollup/` scoped equivalents. This affects the build process but not the runtime.

## Plugins to Replace

| Current Package                | Replacement                    | Status      |
|--------------------------------|--------------------------------|-------------|
| `rollup-plugin-node-resolve`   | `@rollup/plugin-node-resolve`  | Deprecated  |
| `rollup-plugin-commonjs`       | `@rollup/plugin-commonjs`      | Deprecated  |
| `rollup-plugin-json`           | `@rollup/plugin-json`          | Deprecated  |
| `rollup-plugin-babel-minify`   | `@rollup/plugin-terser`        | Deprecated  |

---

## Current Configuration

**File**: `/Users/aslan/Prime/Troupe/rollup.config.js`

```javascript
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
// import babel from 'rollup-plugin-babel';
import minify from 'rollup-plugin-babel-minify';

// don't unroll node modules. Except winston... Don't ask...
const external = id =>
      !id.startsWith('\0')
      && !id.startsWith('.')
      && !id.startsWith('/')
      && !(id == 'winston');

module.exports = {
  input: 'rt/built/troupe.js',
  output: {
    file: 'build/Troupe/rt/built/troupe.js',
    format: 'cjs'
  },

  plugins: [
    resolve(),
    commonjs({
      ignore: ["conditional-runtime-dependency"]
    }),
    json(),
    minify({
       "mangle": { eval : true,
                  // topLevel: true,
                  sort : true,
                  sort : true,
                  screw_ie8 : true
                },
      "keepFnName": false,
      "keepClassName": false,
      comments: false
    })
  ],
  external
};
```

---

## New Plugins Documentation

### @rollup/plugin-node-resolve

Resolves node_modules imports.

**Install**: `npm install @rollup/plugin-node-resolve --save-dev`

**Import change**:
```javascript
// Old
import resolve from 'rollup-plugin-node-resolve';
// New
import resolve from '@rollup/plugin-node-resolve';
```

**API**: Compatible, same `resolve()` call works.

---

### @rollup/plugin-commonjs

Converts CommonJS modules to ES6.

**Install**: `npm install @rollup/plugin-commonjs --save-dev`

**Import change**:
```javascript
// Old
import commonjs from 'rollup-plugin-commonjs';
// New
import commonjs from '@rollup/plugin-commonjs';
```

**API changes**:
- The `ignore` option is now `ignoreDynamicRequires` or handled differently
- May need to use `transformMixedEsModules: true` for some cases

**Updated usage**:
```javascript
commonjs({
  ignoreDynamicRequires: true
})
```

---

### @rollup/plugin-json

Imports JSON files as ES modules.

**Install**: `npm install @rollup/plugin-json --save-dev`

**Import change**:
```javascript
// Old
import json from 'rollup-plugin-json';
// New
import json from '@rollup/plugin-json';
```

**API**: Compatible, same `json()` call works.

---

### @rollup/plugin-terser

Minifies the bundle using terser.

**Install**: `npm install @rollup/plugin-terser --save-dev`

**Import change**:
```javascript
// Old
import minify from 'rollup-plugin-babel-minify';
// New
import terser from '@rollup/plugin-terser';
```

**API changes**: The configuration format is different. Terser uses its own options:

```javascript
terser({
  mangle: {
    eval: true,
    // toplevel: true,  // equivalent to topLevel
  },
  keep_fnames: false,   // equivalent to keepFnName
  keep_classnames: false, // equivalent to keepClassName
  format: {
    comments: false
  }
})
```

---

## Execution Steps

### Step 1: Install New Packages

```bash
cd /Users/aslan/Prime/Troupe

npm install --save-dev \
  @rollup/plugin-node-resolve \
  @rollup/plugin-commonjs \
  @rollup/plugin-json \
  @rollup/plugin-terser
```

### Step 2: Update rollup.config.js

Replace the entire file with:

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

// don't unroll node modules. Except winston... Don't ask...
const external = id =>
      !id.startsWith('\0')
      && !id.startsWith('.')
      && !id.startsWith('/')
      && !(id == 'winston');

export default {
  input: 'rt/built/troupe.js',
  output: {
    file: 'build/Troupe/rt/built/troupe.js',
    format: 'cjs'
  },

  plugins: [
    resolve(),
    commonjs({
      ignoreDynamicRequires: true
    }),
    json(),
    terser({
      mangle: {
        eval: true
      },
      keep_fnames: false,
      keep_classnames: false,
      format: {
        comments: false
      }
    })
  ],
  external
};
```

**Note**: Changed `module.exports` to `export default` for ESM compatibility with modern rollup.

### Step 3: Remove Old Packages

```bash
npm uninstall \
  rollup-plugin-node-resolve \
  rollup-plugin-commonjs \
  rollup-plugin-json \
  rollup-plugin-babel-minify
```

### Step 4: Test Build

```bash
# Test rollup directly
npx rollup -c

# Or through make
make rt
```

### Step 5: Verify Output

```bash
# Check the bundled file exists
ls -la build/Troupe/rt/built/troupe.js

# Check file size is reasonable (minified)
wc -c build/Troupe/rt/built/troupe.js
```

### Step 6: Run Tests

```bash
make test
```

---

## Potential Issues and Solutions

### Issue 1: ESM vs CommonJS Config

If rollup complains about the config format:

**Solution A**: Rename to `rollup.config.mjs` and use `export default`

**Solution B**: Keep `rollup.config.js` with `module.exports` but ensure package.json doesn't have `"type": "module"`

### Issue 2: CommonJS Ignore Option

If the `ignore` option causes issues:

```javascript
// Try this instead
commonjs({
  ignoreDynamicRequires: true,
  // Or for specific modules:
  ignore: (id) => id === 'conditional-runtime-dependency'
})
```

### Issue 3: Terser Options

If terser options cause issues, start with minimal config:

```javascript
terser()  // Use defaults first
```

Then gradually add options back.

### Issue 4: Build Fails Completely

If build fails, check:
1. Node.js version compatibility
2. Rollup version compatibility with new plugins
3. Try updating rollup itself: `npm install rollup@latest`

---

## Rollback

If issues occur:

```bash
# Restore old config
git checkout rollup.config.js

# Reinstall old packages
npm install --save-dev \
  rollup-plugin-node-resolve@^5.2.0 \
  rollup-plugin-commonjs@^10.1.0 \
  rollup-plugin-json@^4.0.0 \
  rollup-plugin-babel-minify@^10.0.0

# Remove new packages
npm uninstall \
  @rollup/plugin-node-resolve \
  @rollup/plugin-commonjs \
  @rollup/plugin-json \
  @rollup/plugin-terser
```

---

## package.json Changes Summary

### devDependencies Before

```json
{
  "devDependencies": {
    "@types/ws": "^8.18.1",
    "@types/yargs": "^17.0.33",
    "rollup": "^4.41.0",
    "rollup-plugin-babel-minify": "^10.0.0",
    "rollup-plugin-commonjs": "^10.1.0",
    "rollup-plugin-json": "^4.0.0",
    "rollup-plugin-node-resolve": "^5.2.0",
    "typescript": "^5.8.3"
  }
}
```

### devDependencies After

```json
{
  "devDependencies": {
    "@types/ws": "^8.18.1",
    "@types/yargs": "^17.0.33",
    "@rollup/plugin-commonjs": "^28.0.0",
    "@rollup/plugin-json": "^6.1.0",
    "@rollup/plugin-node-resolve": "^16.0.0",
    "@rollup/plugin-terser": "^0.4.0",
    "rollup": "^4.41.0",
    "typescript": "^5.8.3"
  }
}
```

(Note: Version numbers for new packages should be checked at install time for latest)

---

## Post-Migration Checklist

- [x] All new @rollup plugins installed
- [x] All old rollup-plugin-* packages removed
- [x] `rollup.config.js` updated with new imports
- [x] `npx rollup -c` runs without errors (N/A - rollup not used in current build)
- [x] `build/Troupe/rt/built/troupe.js` is generated (N/A - rollup not used in current build)
- [x] Output file is minified (check file size) (N/A - rollup not used in current build)
- [x] `make test` passes all tests
- [x] `./local.sh tests/rt/pos/core/simple.trp` works correctly

## Completion Notes

**Completed**: 2025-12-27
**Commit**: `893aa84`

**Key Finding**: Rollup is not currently used in the build process. The Makefile just runs `tsc` for the runtime. The rollup.config.js has been updated for potential future bundling use.

**Changes Made**:
- Installed @rollup/plugin-node-resolve, @rollup/plugin-commonjs, @rollup/plugin-json, @rollup/plugin-terser
- Removed rollup-plugin-node-resolve, rollup-plugin-commonjs, rollup-plugin-json, rollup-plugin-babel-minify
- Updated rollup.config.js with new imports, ESM syntax, and updated API options
- Net result: -604 lines in package-lock.json (removed babel dependencies)
