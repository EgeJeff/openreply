import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  memberFind: vi.fn(),
  accountFind: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: state.auth }));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    workspaceMember: { findFirst: state.memberFind },
    instagramAccount: {
      findUnique: state.accountFind,
      updateMany: state.updateMany,
      create: state.create,
    },
    operationalEvent: { create: state.eventCreate },
  },
}));

vi.mock("@/lib/env", () => ({
  getBaseUrl: () => "https://app.example.test",
}));

vi.mock("@/lib/instagram-accounts", () => ({
  canConnectInstagramAccount: async () => ({ allowed: true, reason: null }),
}));

vi.mock("@/lib/meta/client", () => ({
  getLongLivedToken: async () => ({ accessToken: "long", expiresIn: 5184000 }),
  getUserInfo: async () => ({ id: "app_scoped", user_id: "ig_1", username: "me" }),
  subscribeInstagramAccountToWebhooks: async () => ({ success: true }),
}));

vi.mock("@/lib/meta/oauth", () => ({
  encryptToken: (token: string) => `enc:${token}`,
  exchangeCodeForToken: async () => ({ accessToken: "short", userId: "ig_1" }),
  verifyOAuthState: () => ({ workspaceId: "ws_1", ts: Date.now() }),
}));

vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: () => true,
}));

import { GET } from "../app/api/instagram/callback/route";

function callback() {
  return new NextRequest(
    "https://app.example.test/api/instagram/callback?code=c&state=s"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.auth.mockResolvedValue({ user: { id: "user_1" } });
  state.memberFind.mockResolvedValue({ role: "OWNER" });
  state.updateMany.mockResolvedValue({ count: 1 });
  state.create.mockResolvedValue({});
});

describe("GET /api/instagram/callback", () => {
  it("clears the Unified Login flag when an account reconnects through Instagram Login", async () => {
    state.accountFind.mockResolvedValue({ id: "acc_1" });

    const response = await GET(callback());

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/dashboard?connected=true"
    );
    expect(state.updateMany).toHaveBeenCalledWith({
      where: { id: "acc_1", workspaceId: "ws_1", provider: "META" },
      data: expect.objectContaining({
        accessToken: "enc:long",
        isUnifiedLogin: false,
      }),
    });
  });

  it("stores a new Instagram Login account with the flag off", async () => {
    state.accountFind.mockResolvedValue(null);

    await GET(callback());

    expect(state.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        instagramId: "ig_1",
        isUnifiedLogin: false,
      }),
    });
  });
});
