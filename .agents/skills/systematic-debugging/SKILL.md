---
name: systematic-debugging
description: Evidence-based debugging.
---
# Systematic Debugging Skill

**Purpose**: Trace and fix root causes rather than symptoms.
**When to Use**: Encountering unexpected behavior.

## Workflow
1. **Trace Frontend**: Check network requests via React Query DevTools or browser tools.
2. **Trace Backend**: Use NestJS `Logger` to isolate the failing Controller or Service.
3. **Hypothesize**: Formulate the root cause based on data, not guesses.
4. **Fix & Verify**: Implement the smallest fix and run regression tests. Avoid unrelated refactoring.
