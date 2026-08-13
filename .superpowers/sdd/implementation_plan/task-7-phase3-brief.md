# Task 7: Web Push Notifications — Backend

**Files:**
- Create: `pigmie-api/src/modules/notifications/notifications.module.ts`
- Create: `pigmie-api/src/modules/notifications/notifications.service.ts`
- Create: `pigmie-api/src/modules/notifications/notifications.controller.ts`
- Modify: `pigmie-api/src/app.module.ts` (import NotificationsModule)
- Create: Prisma schema updates for `PushSubscription` and `Notification` models (run `npx prisma db push`).

**Interfaces:**
- Consumes: `web-push`, `TenantPrismaService`
- Produces: 
  - `POST /api/v1/notifications/subscribe` (saves VAPID push subscription)
  - `GET /api/v1/notifications/vapid-public-key`

**Implementation Details:**
- **Step 1: Prisma Schema Updates**
  - In `pigmie-api/prisma/schema.prisma`, add:
    ```prisma
    model PushSubscription {
      id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      userId         String   @map("user_id") @db.Uuid
      endpoint       String
      p256dh         String
      auth           String
      createdAt      DateTime @default(now()) @map("created_at")

      user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

      @@map("push_subscriptions")
    }

    model Notification {
      id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      userId         String   @map("user_id") @db.Uuid
      title          String
      body           String
      type           String   // e.g., 'system', 'loan_disbursed', 'collection_reversed'
      isRead         Boolean  @default(false) @map("is_read")
      createdAt      DateTime @default(now()) @map("created_at")

      user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

      @@map("notifications")
    }
    ```
  - Also add the relations to the `User` model: `pushSubscriptions PushSubscription[]`, `notifications Notification[]`.
  - Run `npx prisma db push`.

- **Step 2: Install dependencies**
  - Run `npm install web-push` and `npm install -D @types/web-push` in `pigmie-api`.

- **Step 3: `notifications.service.ts`**
  - Configure `web-push` using `process.env.VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (mailto link). (For testing, if env vars are missing, generate them dynamically using `webpush.generateVAPIDKeys()`).
  - Implement `subscribe(userId, subscriptionData)`: saves the subscription to `PushSubscription` table.
  - Implement `sendNotification(userId, title, body, type)`: 
    - Saves it to the `Notification` table.
    - Fetches all `PushSubscription`s for the user.
    - Loops and calls `webpush.sendNotification(sub, payload)`. If it fails with 410 Gone, delete the subscription from the DB.

- **Step 4: `notifications.controller.ts`**
  - Add `@Post('subscribe')` (takes the subscription object).
  - Add `@Get('vapid-public-key')` (returns the public key).

**Execution Constraints:**
- Push notifications should only be sent if `web-push` is properly configured, but the in-app `Notification` should always be saved to the DB regardless.
- Verify with `npx tsc --noEmit`.
