# Change Management Rules

1. **Destructive Operations & Gating**:
   - Require explicit user approval before deleting significant files, dropping database columns, modifying production infrastructure, or exposing secrets.
2. **Version Control Safety**:
   - Inspect `git status` before modifying files.
   - Preserve uncommitted changes; NEVER overwrite unrelated user work.
3. **Dependencies & APIs**:
   - Add the smallest necessary dependency. Verify compatibility (React 19, NestJS 11).
   - Preserve backward compatibility for APIs and databases unless explicitly required.
