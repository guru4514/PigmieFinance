---
name: secure-development
description: Implementing secure coding practices.
---
# Secure Development Skill

**Purpose**: Implement security controls for the stack.
**When to Use**: Handling inputs, database queries, and auth.

## Project Conventions
- **Validation**: Use `class-validator` and `class-transformer` (NestJS). Use `zod` and `react-hook-form` (React).
- **Database**: Use Prisma to naturally prevent SQL injection.

## Workflow
1. Validate all incoming API payloads using NestJS DTOs.
2. For Prisma, validate permissions/ownership before `update`/`delete`.
3. Use Supabase JS for frontend auth, but validate the JWT on the NestJS backend using Passport/Guards.
