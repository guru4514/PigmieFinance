---
name: code-review
description: Reviewing code changes for quality.
---
# Code Review Skill

**Purpose**: Self-review changes against standards.
**When to Use**: Before declaring any task complete.

## Workflow
Review diffs prioritizing:
1. **Correctness**: Does it meet the requirement?
2. **Security**: Are there injection/authorization risks?
3. **Performance**: Are there N+1 queries?
4. **Maintenance**: Is logic duplicated? 

*Note: Destructive changes and secrets are strictly governed by Rules.*
