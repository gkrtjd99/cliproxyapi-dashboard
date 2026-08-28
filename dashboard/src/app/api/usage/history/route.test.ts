import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    providerOAuthOwnership: {
      findMany: vi.fn(),
    },
    usageRecord: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    userApiKey: {
      findMany: vi.fn(),
    },
    collectorState: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };

  return {
    prisma,
    verifySession: vi.fn(),
    usageCache: {
      get: vi.fn(),
      set: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  verifySession: mocks.verifySession,
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/cache", () => ({
  usageCache: mocks.usageCache,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function makeEvent(index: number, includeKey = true) {
  return {
    authIndex: "auth-1",
    model: index % 2 === 0 ? "model-a" : "model-b",
    source: "alice",
    latencyMs: index + 1,
    totalTokens: 10 + index,
    inputTokens: 6 + index,
    outputTokens: 4,
    cachedTokens: index + 1,
    failed: index % 10 === 0,
    timestamp: new Date(Date.UTC(2026, 0, 2, 0, 0, index)),
    user: { username: "alice" },
    apiKey: includeKey ? { name: "Production" } : null,
  };
}

function setupTransaction() {
  mocks.prisma.$transaction.mockImplementation(async (queries: Promise<unknown>[]) => Promise.all(queries));
}

function setupCommonDatabase({ isAdmin, empty = false }: { isAdmin: boolean; empty?: boolean }) {
  mocks.verifySession.mockResolvedValue({ userId: "user-1" });
  mocks.usageCache.get.mockReturnValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue({
    isAdmin,
    username: "alice",
  });
  mocks.prisma.providerOAuthOwnership.findMany.mockResolvedValue([
    { accountName: "oauth-account", accountEmail: "oauth@example.com" },
  ]);
  mocks.prisma.userApiKey.findMany.mockResolvedValue([{ id: "key-1", name: "Production" }]);
  mocks.prisma.user.findMany.mockResolvedValue([{ id: "user-1", username: "alice" }]);
  mocks.prisma.collectorState.findUnique.mockResolvedValue({
    lastCollectedAt: new Date("2026-01-31T01:02:03.000Z"),
    lastStatus: "idle",
  });
  setupTransaction();

  if (empty) {
    mocks.prisma.usageRecord.groupBy.mockResolvedValue([]);
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ sampleCount: BigInt(0), averageMs: 0, p95Ms: BigInt(0), maxMs: BigInt(0) }]);
    mocks.prisma.usageRecord.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.prisma.collectorState.findUnique.mockResolvedValue(null);
    return;
  }

  mocks.prisma.usageRecord.groupBy.mockImplementation((args: { by: string[] }) => {
    if (args.by.includes("failed")) {
      return Promise.resolve([
        {
          apiKeyId: "key-1",
          userId: "user-1",
          authIndex: "auth-1",
          source: "alice",
          failed: false,
          _count: { _all: 30_000 },
          _sum: {
            totalTokens: 3_000_000,
            inputTokens: 1_800_000,
            outputTokens: 1_200_000,
            reasoningTokens: 0,
            cachedTokens: 900_000,
          },
        },
        {
          apiKeyId: "key-1",
          userId: "user-1",
          authIndex: "auth-1",
          source: "alice",
          failed: true,
          _count: { _all: 5 },
          _sum: {
            totalTokens: 500,
            inputTokens: 300,
            outputTokens: 200,
            reasoningTokens: 0,
            cachedTokens: 100,
          },
        },
      ]);
    }
    if (args.by.includes("model")) {
      return Promise.resolve([
        {
          apiKeyId: "key-1",
          userId: "user-1",
          authIndex: "auth-1",
          model: "model-a",
          _count: { _all: 30_005 },
          _sum: {
            totalTokens: 3_000_500,
            inputTokens: 1_800_300,
            outputTokens: 1_200_200,
            cachedTokens: 900_100,
          },
        },
      ]);
    }
    return Promise.resolve([
      {
        model: "model-a",
        _count: { _all: 30_005 },
        _sum: { totalTokens: 3_000_500, cachedTokens: 900_100 },
      },
    ]);
  });

  mocks.prisma.$queryRaw
    .mockResolvedValueOnce([
      {
        date: "2026-01-02",
        failed: false,
        requests: BigInt(30_000),
        tokens: BigInt(3_000_000),
        inputTokens: BigInt(1_800_000),
        outputTokens: BigInt(1_200_000),
        cachedTokens: BigInt(900_000),
      },
      {
        date: "2026-01-02",
        failed: true,
        requests: BigInt(5),
        tokens: BigInt(500),
        inputTokens: BigInt(300),
        outputTokens: BigInt(200),
        cachedTokens: BigInt(100),
      },
    ])
    .mockResolvedValueOnce([{ sampleCount: BigInt(30_000), averageMs: "20.5", p95Ms: BigInt(40), maxMs: BigInt(50) }]);

  mocks.prisma.usageRecord.findMany
    .mockResolvedValueOnce(Array.from({ length: 201 }, (_, index) => makeEvent(200 - index)))
    .mockResolvedValueOnce(Array.from({ length: 120 }, (_, index) => makeEvent(119 - index)));
}

async function getUsageResponse(from = "2026-01-01", to = "2026-01-31") {
  const { GET } = await import("./route");
  const request = new NextRequest(`http://localhost/api/usage/history?from=${from}&to=${to}`);
  const response = await GET(request);
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("GET /api/usage/history aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates beyond the event window while keeping events bounded", async () => {
    setupCommonDatabase({ isAdmin: true });

    const response = await getUsageResponse();

    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(true);
    expect(response.body.data.totals).toEqual({
      totalRequests: 30_005,
      totalTokens: 3_000_500,
      inputTokens: 1_800_300,
      outputTokens: 1_200_200,
      cachedTokens: 900_100,
      successCount: 30_000,
      failureCount: 5,
    });
    expect(response.body.data.keys["key-1"]).toMatchObject({
      keyName: "Production",
      totalRequests: 30_005,
      successCount: 30_000,
      failureCount: 5,
      cachedTokens: 900_100,
      models: {
        "model-a": {
          totalRequests: 30_005,
          totalTokens: 3_000_500,
          inputTokens: 1_800_300,
          outputTokens: 1_200_200,
          cachedTokens: 900_100,
        },
      },
    });
    expect(response.body.data.dailyBreakdown).toEqual([{
      date: "2026-01-02",
      requests: 30_005,
      tokens: 3_000_500,
      inputTokens: 1_800_300,
      outputTokens: 1_200_200,
      cachedTokens: 900_100,
      success: 30_000,
      failure: 5,
    }]);
    expect(response.body.data.modelBreakdown).toEqual([
      { model: "model-a", requests: 30_005, tokens: 3_000_500, cachedTokens: 900_100 },
    ]);
    expect(response.body.data.requestEvents).toHaveLength(200);
    expect(response.body.data.requestEvents[0]).toMatchObject({ cachedTokens: 201 });
    expect(response.body.data.latencySeries).toHaveLength(120);
    expect(response.body.data.truncated).toBe(true);
    expect(response.body.data.latencySummary).toEqual({
      sampleCount: 30_000,
      averageMs: 21,
      p95Ms: 40,
      maxMs: 50,
    });
    expect(mocks.prisma.usageRecord.findMany.mock.calls[0]?.[0]).toMatchObject({ take: 201 });
    expect(mocks.prisma.usageRecord.findMany.mock.calls[1]?.[0]).toMatchObject({ take: 120 });
    expect(mocks.usageCache.set).toHaveBeenCalledWith(
      "usage-history:v2:user-1:admin:2026-01-01:2026-01-31",
      response.body,
      5_000,
    );
  });

  it("returns cached responses using the v2 cache key", async () => {
    mocks.verifySession.mockResolvedValue({ userId: "user-1" });
    mocks.prisma.user.findUnique.mockResolvedValue({ isAdmin: true, username: "alice" });
    const cachedResponse = {
      data: { totals: { totalTokens: 99, cachedTokens: 33 } },
      isAdmin: true,
    };
    mocks.usageCache.get.mockReturnValue(cachedResponse);

    const response = await getUsageResponse("2026-01-02", "2026-01-31");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cachedResponse);
    expect(mocks.usageCache.get).toHaveBeenCalledWith(
      "usage-history:v2:user-1:admin:2026-01-02:2026-01-31",
    );
    expect(mocks.prisma.usageRecord.groupBy).not.toHaveBeenCalled();
    expect(mocks.usageCache.set).not.toHaveBeenCalled();
  });

  it("preserves the non-admin user and owned-source filters", async () => {
    setupCommonDatabase({ isAdmin: false });

    const response = await getUsageResponse("2026-01-02", "2026-01-02");

    expect(response.status).toBe(200);
    expect(response.body.isAdmin).toBe(false);
    expect(mocks.prisma.providerOAuthOwnership.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { accountName: true, accountEmail: true },
    });
    const firstGroupBy = mocks.prisma.usageRecord.groupBy.mock.calls[0]?.[0];
    expect(firstGroupBy.where).toEqual({
      timestamp: {
        gte: new Date(2026, 0, 2),
        lte: new Date(2026, 0, 2, 23, 59, 59, 999),
      },
      OR: [
        { userId: "user-1" },
        { source: { in: ["alice", "oauth@example.com", "oauth-account"] } },
      ],
    });
    expect(response.body.data.requestEvents[0]).not.toHaveProperty("username");
    expect(response.body.data.keys["key-1"]).not.toHaveProperty("userId");
  });

  it("returns an empty but complete response without aggregate rows", async () => {
    setupCommonDatabase({ isAdmin: true, empty: true });

    const response = await getUsageResponse("2026-02-01", "2026-02-01");

    expect(response.status).toBe(200);
    expect(response.body.data.keys).toEqual({});
    expect(response.body.data.totals).toEqual({
      totalRequests: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      successCount: 0,
      failureCount: 0,
    });
    expect(response.body.data.dailyBreakdown).toEqual([]);
    expect(response.body.data.modelBreakdown).toEqual([]);
    expect(response.body.data.requestEvents).toEqual([]);
    expect(response.body.data.latencySeries).toEqual([]);
    expect(response.body.data.latencySummary).toEqual({
      sampleCount: 0,
      averageMs: 0,
      p95Ms: 0,
      maxMs: 0,
    });
    expect(response.body.data.truncated).toBe(false);
    expect(response.body.data.collectorStatus).toEqual({
      lastCollectedAt: "",
      lastStatus: "unknown",
    });
  });
});
