---
name: coding-standards
description: Adhering to the project's coding style.
---
# Coding Standards Skill

**Purpose**: Maintain formatting and static analysis rules.
**When to Use**: During code authoring and pre-commit checks.

## Workflow
1. **Frontend**: 
   - Write functional React components.
   - Run `npm run lint` (`oxlint`).
   - Run `npm run build` (`tsc -b` type checking).
2. **Backend**:
   - Use strict TypeScript and dependency injection.
   - Run `npm run format` (Prettier) and `npm run lint` (ESLint).
3. **General**: Avoid `any` types. Handle errors explicitly.
