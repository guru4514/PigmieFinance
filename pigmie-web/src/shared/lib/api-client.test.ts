import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter } from "axios";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
import { apiClient } from "./api-client";

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: {
      session: { user: { id: "account-a" }, access_token: "test-token" },
    },
  });
});

describe("account-bound API requests", () => {
  it("does not send an outbox request using a different account’s token", async () => {
    const adapter = vi.fn<AxiosAdapter>();
    await expect(
      apiClient.post(
        "/collections",
        {},
        { expectedAuthUserId: "account-b", adapter },
      ),
    ).rejects.toThrow("Your account changed");
    expect(adapter).not.toHaveBeenCalled();
  });

  it("does not send an account-bound request after logout", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const adapter = vi.fn<AxiosAdapter>();
    await expect(
      apiClient.post(
        "/collections",
        {},
        { expectedAuthUserId: "account-a", adapter },
      ),
    ).rejects.toThrow("Your account changed");
    expect(adapter).not.toHaveBeenCalled();
  });

  it("uses the current token for the matching account", async () => {
    const adapter = vi
      .fn<AxiosAdapter>()
      .mockImplementation(async (config) => ({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      }));
    await apiClient.post(
      "/collections",
      {},
      { expectedAuthUserId: "account-a", adapter },
    );
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe(
      "Bearer test-token",
    );
  });
});
