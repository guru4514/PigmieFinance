---
name: database-engineering
description: Safely managing database schema and queries.
---
# Database Engineering Skill

**Purpose**: Execute Prisma schema changes and queries safely.
**When to Use**: Modifying `schema.prisma` or writing complex queries.

## Workflow
1. **Schema Changes**:
   - Edit `pigmie-api/prisma/schema.prisma`.
   - Run `npx prisma format`.
   - Create migrations (`prisma migrate dev`).
2. **Queries**:
   - Use Prisma's `include` carefully to avoid over-fetching.
   - Ensure queries utilize appropriate indexes.
3. **Verification**: Generate Prisma client and verify types compile.
