---
name: project-architecture
description: Understanding the project architecture, boundaries, testing, and debugging.
---
# Project Architecture Skill

**Purpose**: Guide placement of new logic in the monorepo, including testing and debugging conventions.
**When to Use**: Designing features, evaluating refactors, or conducting TDD and debugging via Superpowers.

## Project Conventions
- **Backend (`pigmie-api`)**: NestJS modules (`modules/`), business logic in `services/`, shared logic in `common/`.
- **Frontend (`pigmie-web`)**: React/Vite. UI components using Radix/Tailwind. State via Zustand (global) and React Query (server).

## Architecture Workflow
1. Identify if logic belongs in the API (data rules/auth) or Web (UI/presentation).
2. Look for existing abstractions (e.g., a NestJS provider) to reuse.
3. Keep NestJS controllers thin; delegate to services.

## Testing Conventions (For use with Superpowers TDD)
- **Backend Tests**:
  - Write `*.spec.ts` files using Jest.
  - Run `npm run test` (unit tests).
  - Run `npm run test:e2e` (integration tests).
- **Frontend Tests**:
  - Frontend Verification:

    * Run TypeScript/build checks.
    * Use browser/manual verification for runtime behavior.
    * Do not claim automated frontend test coverage unless a frontend test runner exists.

## Debugging Conventions (For use with Superpowers systematic-debugging)
- **Trace Frontend**: Check network requests via React Query DevTools or browser tools.
- **Trace Backend**: Use NestJS `Logger` to isolate the failing Controller or Service.
