import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import { apiClient } from "./api-client";
import { supabase } from "./supabase";
import type { ResolvedUser } from "../types";

const DB_NAME = "pigmie-offline";
const STORE_NAME = "pending-collections";
export const QUEUE_CHANGED_EVENT = "pigmie:collection-queue-changed";
const payloadSchema = z.object({
  clientGeneratedId: z.string().uuid(),
  loanId: z.string().uuid(),
  amount: z
    .number()
    .finite()
    .positive()
    .multipleOf(0.01, "Enter an amount with at most two decimal places."),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  collectedAt: z.string().datetime(),
  collectionMethod: z.enum(["cash", "cheque", "other"]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});
export type CollectionPayload = z.infer<typeof payloadSchema>;
export type CollectionInput = CollectionPayload & {
  offlinePhotoBase64?: string;
};
export interface CollectionOwner {
  authUserId: string;
  organizationId: string;
  staffId: string;
}
interface StoredCollection extends CollectionInput {
  owner?: CollectionOwner;
  queuedAt: string;
  lastError?: string;
  evidencePath?: string;
  paymentAcknowledgement?: CollectionAcknowledgement;
}
export interface PendingCollection extends StoredCollection {
  owner: CollectionOwner;
}
interface OfflineDB extends DBSchema {
  "pending-collections": { key: string; value: StoredCollection };
}
const acknowledgementSchema = z.object({
  status: z.enum(["created", "duplicate"]),
  collection: z.object({
    id: z.string().uuid(),
    clientGeneratedId: z.string().uuid(),
    organizationId: z.string().uuid(),
    collectedById: z.string().uuid(),
    loanId: z.string().uuid(),
    amount: z.coerce.number().finite().positive(),
    collectionDate: z.string(),
    collectionMethod: z.enum(["cash", "cheque", "other"]),
    receiptNumber: z.string().nullable(),
  }),
});
export type CollectionAcknowledgement = z.infer<typeof acknowledgementSchema>;
export interface SyncResult {
  synced: number;
  acknowledged: Record<string, CollectionAcknowledgement>;
}
export type SubmissionResult =
  | { status: "recorded"; acknowledgement: CollectionAcknowledgement }
  | { status: "pending" };
const syncs = new Map<string, Promise<SyncResult>>();
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}
export function getCollectionOwner(
  authUserId: string | undefined,
  user: ResolvedUser | undefined,
): CollectionOwner | undefined {
  if (!authUserId || user?.userType !== "staff" || user.role === "accountant")
    return undefined;
  return { authUserId, organizationId: user.organizationId, staffId: user.id };
}
function belongsTo(
  item: StoredCollection,
  owner: CollectionOwner,
): item is PendingCollection {
  return (
    item.owner?.authUserId === owner.authUserId &&
    item.owner.organizationId === owner.organizationId &&
    item.owner.staffId === owner.staffId
  );
}
function getDB() {
  // Keep legacy records in their original store; never guess their owner.
  return openDB<OfflineDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: "clientGeneratedId" });
    },
  });
}
export async function queueCollection(
  data: CollectionInput,
  owner: CollectionOwner,
): Promise<void> {
  const payload = payloadSchema.parse(data);
  if (!owner.authUserId || !owner.staffId || !owner.organizationId)
    throw new Error("Sign in before saving a collection.");
  const db = await getDB();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    void tx.done.catch(() => undefined);
    const pending = await tx.store.getAll();
    if (
      pending.some(
        (item) => belongsTo(item, owner) && item.loanId === payload.loanId,
      )
    ) {
      tx.abort();
      throw new Error(
        "A collection for this loan is already saved on this device. Sync its payment and evidence before recording another payment.",
      );
    }
    // Never overwrite the original financial payload when an ID is reused.
    await Promise.all([
      tx.store.add({
        ...payload,
        offlinePhotoBase64: data.offlinePhotoBase64,
        owner,
        queuedAt: new Date().toISOString(),
      }),
      tx.done,
    ]);
  } finally {
    db.close();
  }
  changed();
}
export async function getPendingCollections(
  owner: CollectionOwner | undefined,
): Promise<PendingCollection[]> {
  if (!owner) return [];
  const db = await getDB();
  try {
    return (await db.getAll(STORE_NAME))
      .filter((item): item is PendingCollection => belongsTo(item, owner))
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } finally {
    db.close();
  }
}
export async function getLegacyPendingCount(): Promise<number> {
  const db = await getDB();
  try {
    return (await db.getAll(STORE_NAME)).filter((item) => !item.owner).length;
  } finally {
    db.close();
  }
}
export async function getPendingCount(
  owner: CollectionOwner | undefined,
): Promise<number> {
  return (await getPendingCollections(owner)).length;
}
async function updateStored(item: PendingCollection) {
  const db = await getDB();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    void tx.done.catch(() => undefined);
    const existing = await tx.store.get(item.clientGeneratedId);
    if (existing && belongsTo(existing, item.owner)) await tx.store.put(item);
    await tx.done;
  } finally {
    db.close();
  }
  changed();
}
async function removeAcknowledged(item: PendingCollection) {
  const db = await getDB();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    void tx.done.catch(() => undefined);
    const existing = await tx.store.get(item.clientGeneratedId);
    if (existing && belongsTo(existing, item.owner))
      await tx.store.delete(item.clientGeneratedId);
    await tx.done;
  } finally {
    db.close();
  }
  changed();
}
async function checkSession(owner: CollectionOwner) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== owner.authUserId)
    throw new Error(
      "Sign in to the account that saved these collections before syncing.",
    );
}
function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: {
          data?: { error?: { message?: unknown }; message?: unknown };
        };
      }
    ).response;
    const message = response?.data?.error?.message ?? response?.data?.message;
    if (typeof message === "string") return message;
    if (
      Array.isArray(message) &&
      message.every((value) => typeof value === "string")
    )
      return message.join(", ");
  }
  return error instanceof Error
    ? error.message
    : "Could not sync. The collection remains saved on this device.";
}
async function drainQueue(owner: CollectionOwner): Promise<SyncResult> {
  await checkSession(owner);
  const config = { expectedAuthUserId: owner.authUserId };
  const { data: user } = await apiClient.get<ResolvedUser>("/auth/me", config);
  const resolvedOwner = getCollectionOwner(owner.authUserId, user);
  if (
    !resolvedOwner ||
    resolvedOwner.staffId !== owner.staffId ||
    resolvedOwner.organizationId !== owner.organizationId
  ) {
    throw new Error(
      "Your staff account cannot sync these collections. They remain saved on this device.",
    );
  }
  const result: SyncResult = { synced: 0, acknowledged: {} };
  for (const item of await getPendingCollections(owner)) {
    try {
      await checkSession(owner);
      if (item.photoUrl && !item.offlinePhotoBase64)
        throw new Error(
          "This legacy photo needs recovery review. The original collection remains saved.",
        );
      // Public URLs are never sent for new payments. Retain legacy data locally.
      const payload = payloadSchema.parse(item);
      delete payload.photoUrl;
      const response = await apiClient.post<unknown>(
        "/collections",
        payload,
        config,
      );
      const acknowledgement = acknowledgementSchema.parse(response.data);
      const recorded = acknowledgement.collection;
      if (
        recorded.clientGeneratedId !== item.clientGeneratedId ||
        recorded.loanId !== item.loanId ||
        recorded.organizationId !== owner.organizationId ||
        recorded.collectedById !== owner.staffId ||
        recorded.amount !== item.amount ||
        recorded.collectionDate.split("T")[0] !== item.collectionDate ||
        recorded.collectionMethod !== item.collectionMethod
      ) {
        throw new Error(
          "The server response does not match this collection. It remains saved for review.",
        );
      }
      if (item.offlinePhotoBase64) {
        item.paymentAcknowledgement = acknowledgement;
        await updateStored(item);
        // Payment confirmation remains truthful when attachment delivery needs retry.
        result.acknowledged[item.clientGeneratedId] = acknowledgement;
        if (
          !/^data:image\/(png|jpeg|webp);base64,/.test(item.offlinePhotoBase64)
        )
          throw new Error(
            "The saved collection photo is invalid. Payment may already be confirmed; retry uses its original identifier.",
          );
        const blob = await (await fetch(item.offlinePhotoBase64)).blob();
        if (blob.size > 10 * 1024 * 1024)
          throw new Error(
            "The saved photo exceeds 10 MB. Payment and evidence remain saved for review.",
          );
        if (!item.evidencePath) {
          await checkSession(owner);
          const extension =
            blob.type === "image/jpeg"
              ? "jpg"
              : blob.type === "image/webp"
                ? "webp"
                : "png";
          const grant = z
            .object({
              path: z.string(),
              token: z.string(),
              bucket: z.literal("collection-photos"),
            })
            .parse(
              (
                await apiClient.post(
                  "/documents/upload-url",
                  {
                    relatedEntityType: "collection",
                    relatedEntityId: recorded.id,
                    documentType: "collection_photo",
                    fileName: `${item.clientGeneratedId}.${extension}`,
                  },
                  config,
                )
              ).data,
            );
          const prefix = `${owner.organizationId}/collection/${recorded.id}/`;
          if (
            !grant.path.startsWith(prefix) ||
            /[\\%?#]/.test(grant.path.slice(prefix.length)) ||
            grant.path.slice(prefix.length).includes("/")
          )
            throw new Error(
              "The photo upload grant does not match this collection.",
            );
          const { error } = await supabase.storage
            .from(grant.bucket)
            .uploadToSignedUrl(grant.path, grant.token, blob, {
              contentType: blob.type,
            });
          if (error)
            throw new Error(
              "Photo upload failed. Payment may be confirmed; the original photo remains saved for retry.",
            );
          await checkSession(owner);
          item.evidencePath = grant.path;
          await updateStored(item);
        }
        await checkSession(owner);
        const document = z
          .object({
            id: z.string().uuid(),
            filePath: z.string(),
            relatedEntityId: z.string().uuid(),
            relatedEntityType: z.literal("collection"),
          })
          .parse(
            (
              await apiClient.post(
                "/documents",
                {
                  relatedEntityType: "collection",
                  relatedEntityId: recorded.id,
                  documentType: "collection_photo",
                  filePath: item.evidencePath,
                },
                config,
              )
            ).data,
          );
        if (
          document.filePath !== item.evidencePath ||
          document.relatedEntityId !== recorded.id
        )
          throw new Error(
            "The evidence acknowledgement does not match this collection. It remains saved for review.",
          );
      }
      await removeAcknowledged(item);
      result.synced++;
      result.acknowledged[item.clientGeneratedId] = acknowledgement;
    } catch (error: unknown) {
      item.lastError = errorMessage(error);
      await updateStored(item);
      // Generic conflicts and uncertain HTTP outcomes are not proof of successful recording.
    }
  }
  return result;
}
export function processSyncQueue(owner: CollectionOwner): Promise<SyncResult> {
  const key = `${owner.authUserId}:${owner.organizationId}:${owner.staffId}`;
  const existing = syncs.get(key);
  if (existing) return existing;
  const operation =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`pigmie:sync:${key}`, () => drainQueue(owner))
      : drainQueue(owner);
  const sync = operation.finally(() => {
    syncs.delete(key);
  });
  syncs.set(key, sync);
  return sync;
}
export async function submitCollection(
  data: CollectionInput,
  owner: CollectionOwner,
): Promise<SubmissionResult> {
  // Commit the original operation locally before attempting transmission.
  await queueCollection(data, owner);
  if (!navigator.onLine) return { status: "pending" };
  try {
    let result = await processSyncQueue(owner);
    // A save may arrive while an earlier sync is already processing its snapshot.
    if (!result.acknowledged[data.clientGeneratedId]) {
      const pending = (await getPendingCollections(owner)).find(
        (item) => item.clientGeneratedId === data.clientGeneratedId,
      );
      if (pending && !pending.lastError) result = await processSyncQueue(owner);
    }
    const acknowledgement = result.acknowledged[data.clientGeneratedId];
    if (acknowledgement) return { status: "recorded", acknowledgement };
  } catch {
    // Once stored, a failed sync must not prompt a new payment with a new ID.
  }
  return { status: "pending" };
}
