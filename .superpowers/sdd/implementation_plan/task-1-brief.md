# Task 1: Per-Org Rate Limiting

**Goal:** Implement per-organization rate limiting using a custom NestJS ThrottlerGuard, replacing the default IP-based rate limiting.

**Context:** The API currently uses `@nestjs/throttler` (v6.5.0) which defaults to rate-limiting by IP address. The specification mandates that rate limiting should be tracked per organization. We need to create a custom guard that overrides `getTracker` to use the authenticated user's `organizationId`, and fallback to IP if the user is unauthenticated.

**Requirements:**
1. Create `pigmie-api/src/common/guards/org-throttler.guard.ts`.
2. The class `OrgThrottlerGuard` must extend `ThrottlerGuard`.
3. Override `protected async getTracker(req: Record<string, any>): Promise<string>`.
4. If `req.user` exists and has `organizationId`, return `` `org:${req.user.organizationId}` ``.
5. If not, fallback to IP address using `` `ip:${req.ips?.length ? req.ips[0] : req.ip}` ``.
6. Modify `pigmie-api/src/app.module.ts` to replace the default `APP_GUARD` ThrottlerGuard with the new `OrgThrottlerGuard`.

**Execution Constraints:**
- Must compile without TypeScript errors.
- Ensure the custom guard is exported and correctly registered in the providers array.
