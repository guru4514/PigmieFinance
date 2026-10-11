import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionInput, CollectionOwner } from "./offline-queue";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getSession: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("./api-client", () => ({
  apiClient: { get: mocks.get, post: mocks.post },
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
  },
}));

const owner: CollectionOwner = {
  authUserId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  staffId: "00000000-0000-4000-8000-000000000003",
};
const other: CollectionOwner = {
  ...owner,
  authUserId: "00000000-0000-4000-8000-000000000004",
  staffId: "00000000-0000-4000-8000-000000000005",
};
const input: CollectionInput = {
  clientGeneratedId: "00000000-0000-4000-8000-000000000006",
  loanId: "00000000-0000-4000-8000-000000000007",
  amount: 100,
  collectionDate: "2026-10-10",
  collectedAt: "2026-10-10T12:00:00.000Z",
  collectionMethod: "cash",
};
function acknowledge(data: CollectionInput = input, status = "created") {
  return {
    data: {
      status,
      collection: {
        id: "00000000-0000-4000-8000-000000000008",
        ...data,
        amount: String(data.amount),
        organizationId: owner.organizationId,
        collectedById: owner.staffId,
        collectionDate: `${data.collectionDate}T00:00:00.000Z`,
        receiptNumber: "RCP-TEST",
      },
    },
  };
}
async function load() {
  return import("./offline-queue");
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await deleteDB("pigmie-offline");
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: owner.authUserId } } },
    error: null,
  });
  mocks.get.mockResolvedValue({
    data: {
      userType: "staff",
      id: owner.staffId,
      organizationId: owner.organizationId,
      role: "agent",
    },
  });
  mocks.post.mockResolvedValue(acknowledge());
  mocks.upload.mockResolvedValue({
    data: { path: "collections/photo" },
    error: null,
  });
  mocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://storage.example/photo" },
  });
});

describe("durable collection outbox", () => {
  it("rejects sub-cent amounts before persisting and accepts exact cent amounts", async () => {
    const queue = await load();
    await expect(
      queue.queueCollection({ ...input, amount: 1.001 }, owner),
    ).rejects.toThrow("at most two decimal places");
    await queue.queueCollection({ ...input, amount: 0.29 }, owner);
    expect((await queue.getPendingCollections(owner))[0].amount).toBe(0.29);
  });

  it("saves offline and survives a new module instance without sending a request", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const queue = await load();
    expect(await queue.submitCollection(input, owner)).toEqual({
      status: "pending",
    });
    vi.resetModules();
    expect(await (await load()).getPendingCollections(owner)).toEqual([
      expect.objectContaining({ ...input, owner }),
    ]);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("reports storage failure before any network request or success", async () => {
    const queue = await load();
    const db = await openDB("pigmie-offline", 1, {
      upgrade(db) {
        db.createObjectStore("pending-collections", {
          keyPath: "clientGeneratedId",
        });
      },
    });
    db.close();
    const transaction = vi
      .spyOn(IDBDatabase.prototype, "transaction")
      .mockImplementationOnce(() => {
        throw new DOMException("Device storage full", "QuotaExceededError");
      });
    await expect(queue.submitCollection(input, owner)).rejects.toThrow(
      "Device storage full",
    );
    expect(mocks.post).not.toHaveBeenCalled();
    transaction.mockRestore();
  });

  it("never replaces an existing payment when its operation ID is reused", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    await expect(
      queue.queueCollection({ ...input, amount: 200 }, owner),
    ).rejects.toThrow();
    expect((await queue.getPendingCollections(owner))[0].amount).toBe(100);
  });

  it("atomically prevents two pending payments for the same loan across module instances", async () => {
    const first = await load();
    vi.resetModules();
    const second = await load();
    const results = await Promise.allSettled([
      first.queueCollection(input, owner),
      second.queueCollection(
        { ...input, clientGeneratedId: "00000000-0000-4000-8000-000000000009" },
        owner,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(await first.getPendingCount(owner)).toBe(1);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("only lists and syncs the original staff account’s entries", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    await queue.queueCollection(
      { ...input, clientGeneratedId: "00000000-0000-4000-8000-000000000009" },
      other,
    );
    expect(await queue.getPendingCount(owner)).toBe(1);
    expect(await queue.getPendingCollections(undefined)).toEqual([]);
    await queue.processSyncQueue(owner);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(await queue.getPendingCount(other)).toBe(1);
  });

  it("retains legacy entries without guessing their owner or sending them", async () => {
    const queue = await load();
    const db = await openDB("pigmie-offline", 1, {
      upgrade(db) {
        db.createObjectStore("pending-collections", {
          keyPath: "clientGeneratedId",
        });
      },
    });
    await db.put("pending-collections", {
      ...input,
      queuedAt: "2026-10-09T12:00:00Z",
    });
    db.close();
    expect(await queue.getLegacyPendingCount()).toBe(1);
    expect(await queue.getPendingCount(owner)).toBe(0);
    await queue.processSyncQueue(owner);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(await queue.getLegacyPendingCount()).toBe(1);
  });

  it.each([
    ["network failure", new Error("Connection lost")],
    [
      "generic conflict",
      { response: { status: 409, data: { message: "Loan conflict" } } },
    ],
    [
      "expired token",
      { response: { status: 401, data: { message: "Token expired" } } },
    ],
    [
      "validation failure",
      { response: { status: 400, data: { message: "Invalid collection" } } },
    ],
  ])("retains the original ID and payload after %s", async (_, error) => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    mocks.post.mockRejectedValue(error);
    expect((await queue.processSyncQueue(owner)).synced).toBe(0);
    expect(await queue.getPendingCollections(owner)).toEqual([
      expect.objectContaining({ ...input, lastError: expect.any(String) }),
    ]);
  });

  it.each([
    "amount",
    "loanId",
    "clientGeneratedId",
    "organizationId",
    "collectedById",
    "collectionDate",
    "collectionMethod",
  ])(
    "does not remove a collection after a mismatched %s acknowledgement",
    async (field) => {
      const queue = await load();
      await queue.queueCollection(input, owner);
      const response = acknowledge();
      const mismatch: Record<string, unknown> = {
        ...response.data.collection,
        [field]:
          field === "amount"
            ? 200
            : field === "collectionDate"
              ? "2026-10-09"
              : field === "collectionMethod"
                ? "cheque"
                : "00000000-0000-4000-8000-000000000099",
      };
      mocks.post.mockResolvedValue({
        data: { status: "duplicate", collection: mismatch },
      });
      expect((await queue.processSyncQueue(owner)).synced).toBe(0);
      expect(await queue.getPendingCount(owner)).toBe(1);
    },
  );

  it("treats an unknown success response as pending rather than deleting the entry", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    mocks.post.mockResolvedValue({ data: { success: true } });
    expect((await queue.processSyncQueue(owner)).synced).toBe(0);
    expect(await queue.getPendingCount(owner)).toBe(1);
  });

  it("retries the same ID after a lost acknowledgement and removes it only on a matching duplicate response", async () => {
    const queue = await load();
    mocks.post
      .mockRejectedValueOnce(new Error("Response lost after server commit"))
      .mockResolvedValueOnce(acknowledge(input, "duplicate"));
    await queue.queueCollection(input, owner);
    await queue.processSyncQueue(owner);
    expect(await queue.getPendingCount(owner)).toBe(1);
    expect((await queue.processSyncQueue(owner)).synced).toBe(1);
    expect(await queue.getPendingCount(owner)).toBe(0);
    expect(mocks.post.mock.calls.map((call) => call[1])).toEqual([
      input,
      input,
    ]);
    expect(mocks.post).toHaveBeenCalledWith("/collections", input, {
      expectedAuthUserId: owner.authUserId,
    });
  });

  it("persists before posting and returns the actual server receipt", async () => {
    const queue = await load();
    mocks.post.mockImplementation(async () => {
      expect(await queue.getPendingCount(owner)).toBe(1);
      return acknowledge();
    });
    const result = await queue.submitCollection(input, owner);
    expect(result).toEqual({
      status: "recorded",
      acknowledgement: expect.objectContaining({
        collection: expect.objectContaining({
          receiptNumber: "RCP-TEST",
          amount: 100,
        }),
      }),
    });
    expect(await queue.getPendingCount(owner)).toBe(0);
  });

  it("does not send entries after an account switch", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: other.authUserId } } },
      error: null,
    });
    await expect(queue.processSyncQueue(owner)).rejects.toThrow(
      "Sign in to the account",
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(await queue.getPendingCount(owner)).toBe(1);
  });

  it("does not sync when the server resolves a different staff identity", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    mocks.get.mockResolvedValue({
      data: {
        userType: "staff",
        id: other.staffId,
        organizationId: owner.organizationId,
        role: "agent",
      },
    });
    await expect(queue.processSyncQueue(owner)).rejects.toThrow("cannot sync");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("preserves photo evidence and does not post when upload fails", async () => {
    const queue = await load();
    const withPhoto = {
      ...input,
      offlinePhotoBase64: "data:image/png;base64,AA==",
    };
    mocks.upload.mockResolvedValue({
      data: null,
      error: new Error("Upload failed"),
    });
    await queue.queueCollection(withPhoto, owner);
    expect((await queue.processSyncQueue(owner)).synced).toBe(0);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(
      (await queue.getPendingCollections(owner))[0].offlinePhotoBase64,
    ).toBe(withPhoto.offlinePhotoBase64);
  });

  it("reuses a persisted uploaded photo URL after a failed payment request", async () => {
    const queue = await load();
    await queue.queueCollection(
      { ...input, offlinePhotoBase64: "data:image/png;base64,AA==" },
      owner,
    );
    mocks.post
      .mockRejectedValueOnce(new Error("Network failure"))
      .mockResolvedValueOnce(acknowledge());
    await queue.processSyncQueue(owner);
    await queue.processSyncQueue(owner);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenLastCalledWith(
      "/collections",
      { ...input, photoUrl: "https://storage.example/photo" },
      { expectedAuthUserId: owner.authUserId },
    );
  });

  it("serializes concurrent sync calls within one account", async () => {
    const queue = await load();
    await queue.queueCollection(input, owner);
    const first = queue.processSyncQueue(owner);
    expect(queue.processSyncQueue(owner)).toBe(first);
    await first;
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("includes a new save that arrives while an earlier sync is in flight", async () => {
    const queue = await load();
    const second = {
      ...input,
      clientGeneratedId: "00000000-0000-4000-8000-000000000009",
      loanId: "00000000-0000-4000-8000-000000000010",
    };
    await queue.queueCollection(input, owner);
    let complete!: () => void;
    const hold = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let posted!: () => void;
    const started = new Promise<void>((resolve) => {
      posted = resolve;
    });
    mocks.post
      .mockImplementationOnce(async () => {
        posted();
        await hold;
        return acknowledge();
      })
      .mockResolvedValueOnce(acknowledge(second));
    const firstSync = queue.processSyncQueue(owner);
    await started;
    const submission = queue.submitCollection(second, owner);
    // Ensure the new save has committed while the first HTTP request is held.
    await vi.waitFor(async () =>
      expect(await queue.getPendingCount(owner)).toBe(2),
    );
    complete();
    await firstSync;
    expect((await submission).status).toBe("recorded");
    expect(await queue.getPendingCount(owner)).toBe(0);
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it("does not immediately resend a rejected payment during submission", async () => {
    const queue = await load();
    mocks.post.mockRejectedValue({
      response: { status: 400, data: { message: "Loan is not active" } },
    });
    expect(await queue.submitCollection(input, owner)).toEqual({
      status: "pending",
    });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(await queue.getPendingCount(owner)).toBe(1);
  });
});
