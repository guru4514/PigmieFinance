---
name: threat-modeling
description: Proactively identifying and mitigating security threats and race conditions.
---
# Threat Modeling Skill

**Purpose**: Systematically analyze features for vulnerabilities, race conditions, and failure modes.
**When to Use**: Designing a new feature, modifying authorization logic, or reviewing a critical pull request.

## Workflow
When evaluating a change, explicitly answer the following questions to identify and mitigate risks:

1. **Who can access this?** (Identify authentication requirements)
2. **What can they modify?** (Identify authorization boundaries and potential IDOR)
3. **What happens if this request is forged?** (CSRF, SSRF protections)
4. **What if the client is malicious?** (Strict backend input validation, bypassing client-side checks)
5. **What if the database is queried directly?** (Data at rest, least privilege)
6. **What secrets are exposed?** (Tokens, PII, keys in transit/logs/client)
7. **What happens after authentication expires?** (Session management, token rotation/revocation)
8. **What happens if two requests happen simultaneously?** (Race conditions, database locks, idempotency)
9. **What happens if an external service fails?** (Graceful degradation, retries, timeouts, cascading failures)

## Verification Requirements
- Document the answers to these questions during the `Phase 2 (Plan)` stage of the engineering workflow.
- Ensure the NestJS backend explicitly handles the identified failure states and edge cases (e.g., rate limiters, transactions for race conditions, auth guards).
