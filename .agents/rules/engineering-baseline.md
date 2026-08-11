# Engineering Baseline Rules

**Stack**: NestJS/Prisma (API), React/Vite/Tailwind v4 (Web).

1. **Global Workflow**:
   - **Phase 0-2 (Plan)**: Understand, inspect existing architecture, plan before modifying.
   - **Phase 3-4 (Implement & Verify)**: Implement incrementally. Run `eslint`/`oxlint`, `prettier`, `tsc`, and `jest` tests. 
   - **Phase 5-6 (Review & Report)**: Check edge cases, report files modified and verification results.
2. **Quality Gates**:
   - NEVER claim a task is complete without verification.
   - Prefer the smallest safe change.
   - Reuse existing utilities (NestJS modules, React hooks, Radix UI) before creating new ones.
