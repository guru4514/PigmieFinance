---
name: testing-strategy
description: Executing testing approaches.
---
# Testing Strategy Skill

**Purpose**: Execute tests in the NestJS backend.
**When to Use**: Adding features or fixing bugs.

## Workflow
1. **Backend Tests**: 
   - Write `*.spec.ts` files using Jest.
   - Run `npm run test` (unit tests).
   - Run `npm run test:e2e` (integration tests).
2. **Frontend Tests**: 
   - Rely on strict TypeScript checking (`tsc -b`) and manual verification unless a test runner is added.
3. **Bug Fixes**: Write a regression test first, implement the fix, then verify the test passes.
