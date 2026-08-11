---
name: deployment-readiness
description: Preparing code for deployment.
---
# Deployment Readiness Skill

**Purpose**: Final build and environment checks.
**When to Use**: Wrapping up infrastructure or major feature tasks.

## Workflow
1. **Backend**: Run `npm run build` in `pigmie-api`.
2. **Frontend**: Run `npm run build` in `pigmie-web`.
3. **Environment**: Verify `.env` handles production defaults safely.
4. **Migrations**: Ensure Prisma migrations are generated and tested locally.
