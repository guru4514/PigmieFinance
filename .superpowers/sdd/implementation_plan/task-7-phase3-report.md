# Task 7: Web Push Notifications — Backend Report

## What I implemented
- Added the `PushSubscription` model to `schema.prisma` using `authUserId` as the identifier (as per user clarification).
- Installed `web-push` and `@types/web-push`.
- Updated `NotificationsService` to configure VAPID keys, implement subscription storage, and dispatch push notifications through `webpush` when saving a `Notification`.
- Updated `NotificationsController` to expose `/notifications/subscribe` and `/notifications/vapid-public-key` endpoints.
- Mapped authenticated users to their corresponding `authUserId` when subscribing or retrieving subscriptions.

## What I tested and test results
- Successfully generated Prisma Client (`npx prisma generate`).
- Validated TypeScript compilation successfully with `npx tsc --noEmit` (passing with pristine output).

## Files changed
- `pigmie-api/prisma/schema.prisma`
- `pigmie-api/package.json`
- `pigmie-api/package-lock.json`
- `pigmie-api/src/modules/notifications/notifications.service.ts`
- `pigmie-api/src/modules/notifications/notifications.controller.ts`

## Self-review findings
- The schema logic cleanly maps push subscriptions without cluttering `Staff` and `Customer` schemas heavily, adhering nicely to Option C.
- The VAPID environment variables need to be correctly populated in production; if not set, they dynamically generate and warn in the logs.
- The `NotificationsModule` was already configured and imported in `AppModule`.

## Issues or concerns
- None at this time. The implementation aligns well with the existing schema structure.
