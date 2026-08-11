---
name: project-architecture
description: Understanding the project architecture and boundaries.
---
# Project Architecture Skill

**Purpose**: Guide placement of new logic in the monorepo.
**When to Use**: Designing features or evaluating refactors.

## Project Conventions
- **Backend (`pigmie-api`)**: NestJS modules (`modules/`), business logic in `services/`, shared logic in `common/`.
- **Frontend (`pigmie-web`)**: React/Vite. UI components using Radix/Tailwind. State via Zustand (global) and React Query (server).

## Workflow
1. Identify if logic belongs in the API (data rules/auth) or Web (UI/presentation).
2. Look for existing abstractions (e.g., a NestJS provider) to reuse.
3. Keep NestJS controllers thin; delegate to services.
