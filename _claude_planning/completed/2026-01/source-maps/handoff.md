# Source Maps Implementation - Handoff Document

## How to Continue This Work

**Each phase should be run in a separate fresh context.**

### Starting a New Phase

1. **Read the index:**
   ```
   _claude_planning/source-maps/index.md
   ```

2. **Find the NEXT phase** in the Phase Overview table

3. **Read the phase file** (e.g., `phase-07-core.md`)

4. **Implement the phase**

5. **Run tests:** `bin/golden --quick`

6. **Update the index:**
   - Mark completed phase as DONE with date
   - Mark next phase as **NEXT**
   - Add notes to Implementation Progress section if needed

---

## Single Source of Truth

**Phase overview and status**: `index.md`

**Detailed instructions per phase**: `phase-XX-*.md`

Do not duplicate status information across files.
