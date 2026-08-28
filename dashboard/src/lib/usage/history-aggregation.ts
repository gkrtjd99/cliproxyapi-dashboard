import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

const REQUEST_EVENT_LIMIT = 200;
const LATENCY_SERIES_LIMIT = 120;

type UsageRecordWhere = Prisma.UsageRecordWhereInput;

export interface UsageHistoryAggregationInput {
  db: PrismaClient;
  whereClause: UsageRecordWhere;
  fromDate: Date;
  toDate: Date;
  isAdmin: boolean;
  sessionUserId: string;
  sourceFilter: string[];
}

export interface UsageKey {
  keyName: string;
  username?: string;
  userId?: string;
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  successCount: number;
  failureCount: number;
  models: Record<string, {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }>;
}

export interface UsageRequestEvent {
  timestamp: string;
  keyName: string;
  username?: string;
  model: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  failed: boolean;
}

export interface UsageLatencyPoint {
  timestamp: string;
  keyName: string;
  username?: string;
  model: string;
  latencyMs: number;
  failed: boolean;
}

export interface UsageLatencySummary {
  sampleCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface UsageHistoryAggregation {
  keys: Record<string, UsageKey>;
  totals: {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    successCount: number;
    failureCount: number;
  };
  dailyBreakdown: Array<{
    date: string;
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    success: number;
    failure: number;
  }>;
  modelBreakdown: Array<{
    model: string;
    requests: number;
    tokens: number;
    cachedTokens: number;
  }>;
  requestEvents: UsageRequestEvent[];
  latencySeries: UsageLatencyPoint[];
  latencySummary: UsageLatencySummary;
  collectorStatus: {
    lastCollectedAt: string;
    lastStatus: string;
  };
  truncated: boolean;
}

type DailyAggregationRow = {
  date: string;
  failed: boolean;
  requests: number | bigint;
  tokens: number | bigint;
  inputTokens: number | bigint;
  outputTokens: number | bigint;
  cachedTokens: number | bigint;
};

type LatencyAggregationRow = {
  sampleCount: number | bigint;
  averageMs: unknown;
  p95Ms: unknown;
  maxMs: number | bigint | null;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numberValue = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getServerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function buildRawWhereClause({
  fromDate,
  toDate,
  isAdmin,
  sessionUserId,
  sourceFilter,
}: Pick<UsageHistoryAggregationInput, "fromDate" | "toDate" | "isAdmin" | "sessionUserId" | "sourceFilter">): Prisma.Sql {
  const sourceCondition = sourceFilter.length > 0
    ? Prisma.sql` OR "source" IN (${Prisma.join(sourceFilter)})`
    : Prisma.sql``;
  const accessCondition = isAdmin
    ? Prisma.sql``
    : Prisma.sql` AND ("userId" = ${sessionUserId}${sourceCondition})`;

  return Prisma.sql`"timestamp" >= ${fromDate} AND "timestamp" <= ${toDate}${accessCondition}`;
}

function groupKey(group: { apiKeyId: string | null; userId: string | null; authIndex: string }): string {
  return group.apiKeyId ?? group.userId ?? group.authIndex;
}

function fallbackKeyName(authIndex: string): string {
  return `Key ${authIndex.slice(0, 6)}`;
}

function createKeyUsage(
  keyName: string,
  isAdmin: boolean,
  userId: string | null,
  username?: string,
): UsageKey {
  return {
    keyName,
    ...(isAdmin && username ? { username } : {}),
    ...(isAdmin && userId ? { userId } : {}),
    totalRequests: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    successCount: 0,
    failureCount: 0,
    models: {},
  };
}

function eventKeyName(record: {
  apiKey?: { name: string } | null;
  user?: { username: string } | null;
  source: string;
  authIndex: string;
}): string {
  return record.apiKey?.name
    ?? record.user?.username
    ?? record.source
    ?? fallbackKeyName(record.authIndex);
}

function eventTimestamp(value: Date): string {
  return value.toISOString();
}

export async function aggregateUsageHistory({
  db,
  whereClause,
  fromDate,
  toDate,
  isAdmin,
  sessionUserId,
  sourceFilter,
}: UsageHistoryAggregationInput): Promise<UsageHistoryAggregation> {
  const rawWhereClause = buildRawWhereClause({
    fromDate,
    toDate,
    isAdmin,
    sessionUserId,
    sourceFilter,
  });
  const serverTimeZone = getServerTimeZone();

  const keyStatusGroups = db.usageRecord.groupBy({
    where: whereClause,
    by: ["apiKeyId", "userId", "authIndex", "source", "failed"],
    _count: { _all: true },
    _sum: {
      totalTokens: true,
      inputTokens: true,
      outputTokens: true,
      reasoningTokens: true,
      cachedTokens: true,
    },
  });
  const keyModelGroups = db.usageRecord.groupBy({
    where: whereClause,
    by: ["apiKeyId", "userId", "authIndex", "model"],
    _count: { _all: true },
    _sum: {
      totalTokens: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
    },
  });
  const modelGroups = db.usageRecord.groupBy({
    where: whereClause,
    by: ["model"],
    _count: { _all: true },
    _sum: { totalTokens: true, cachedTokens: true },
  });
  const dailyGroups = db.$queryRaw<DailyAggregationRow[]>(Prisma.sql`
    SELECT
      TO_CHAR(("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${serverTimeZone}, 'YYYY-MM-DD') AS "date",
      "failed" AS "failed",
      COUNT(*) AS "requests",
      COALESCE(SUM("totalTokens"), 0) AS "tokens",
      COALESCE(SUM("inputTokens"), 0) AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0) AS "outputTokens",
      COALESCE(SUM("cachedTokens"), 0) AS "cachedTokens"
    FROM "usage_records"
    WHERE ${rawWhereClause}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);
  const latencySummaryQuery = db.$queryRaw<LatencyAggregationRow[]>(Prisma.sql`
    SELECT
      COUNT(*) AS "sampleCount",
      COALESCE(AVG("latencyMs"), 0) AS "averageMs",
      COALESCE(PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY "latencyMs"), 0) AS "p95Ms",
      COALESCE(MAX("latencyMs"), 0) AS "maxMs"
    FROM "usage_records"
    WHERE ${rawWhereClause}
      AND "latencyMs" > 0
  `);
  const requestEventsQuery = db.usageRecord.findMany({
    where: whereClause,
    select: {
      authIndex: true,
      model: true,
      source: true,
      latencyMs: true,
      totalTokens: true,
      inputTokens: true,
      outputTokens: true,
      cachedTokens: true,
      failed: true,
      timestamp: true,
      user: { select: { username: true } },
      apiKey: { select: { name: true } },
    },
    orderBy: { timestamp: "desc" },
    take: REQUEST_EVENT_LIMIT + 1,
  });
  const latencyEventsQuery = db.usageRecord.findMany({
    where: { ...whereClause, latencyMs: { gt: 0 } },
    select: {
      authIndex: true,
      model: true,
      source: true,
      latencyMs: true,
      failed: true,
      timestamp: true,
      user: { select: { username: true } },
      apiKey: { select: { name: true } },
    },
    orderBy: { timestamp: "desc" },
    take: LATENCY_SERIES_LIMIT,
  });
  const collectorStateQuery = db.collectorState.findUnique({
    where: { id: "singleton" },
  });

  const [
    keyStatusGroupsResult,
    keyModelGroupsResult,
    modelGroupsResult,
    dailyGroupsResult,
    latencySummaryRows,
    requestEventRows,
    latencyEventRows,
    collectorState,
  ] = await db.$transaction([
    keyStatusGroups,
    keyModelGroups,
    modelGroups,
    dailyGroups,
    latencySummaryQuery,
    requestEventsQuery,
    latencyEventsQuery,
    collectorStateQuery,
  ]);

  const apiKeyIds = [...new Set(
    keyStatusGroupsResult
      .map((group) => group.apiKeyId)
      .filter((id): id is string => id !== null),
  )];
  const userIds = [...new Set(
    keyStatusGroupsResult
      .map((group) => group.userId)
      .filter((id): id is string => id !== null),
  )];
  const [apiKeys, users] = await Promise.all([
    apiKeyIds.length > 0
      ? db.userApiKey.findMany({ where: { id: { in: apiKeyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    userIds.length > 0
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : Promise.resolve([]),
  ]);
  const apiKeyNames = new Map(apiKeys.map((key) => [key.id, key.name]));
  const userNames = new Map(users.map((user) => [user.id, user.username]));

  const keyUsageMap: Record<string, UsageKey> = {};
  const keySources = new Map<string, string>();
  let totalRequests = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalSuccessCount = 0;
  let totalFailureCount = 0;

  for (const group of keyStatusGroupsResult) {
    const key = groupKey(group);
    const source = group.source || "";
    if (source && !keySources.has(key)) keySources.set(key, source);

    const keyName = group.apiKeyId
      ? apiKeyNames.get(group.apiKeyId)
      : group.userId
        ? userNames.get(group.userId)
        : undefined;
    const usage = keyUsageMap[key] ?? (keyUsageMap[key] = createKeyUsage(
      keyName ?? keySources.get(key) ?? source ?? fallbackKeyName(group.authIndex),
      isAdmin,
      group.userId,
      group.userId ? userNames.get(group.userId) : undefined,
    ));
    if (isAdmin && group.userId && !usage.userId) usage.userId = group.userId;

    const requests = toNumber(group._count?._all);
    const tokens = toNumber(group._sum?.totalTokens);
    const inputTokens = toNumber(group._sum?.inputTokens);
    const outputTokens = toNumber(group._sum?.outputTokens);
    const cachedTokens = toNumber(group._sum?.cachedTokens);
    usage.totalRequests += requests;
    usage.totalTokens += tokens;
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.reasoningTokens += toNumber(group._sum?.reasoningTokens);
    usage.cachedTokens += cachedTokens;
    totalRequests += requests;
    totalTokens += tokens;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCachedTokens += cachedTokens;
    if (group.failed) {
      usage.failureCount += requests;
      totalFailureCount += requests;
    } else {
      usage.successCount += requests;
      totalSuccessCount += requests;
    }
  }

  for (const group of keyModelGroupsResult) {
    const key = groupKey(group);
    const usage = keyUsageMap[key] ?? (keyUsageMap[key] = createKeyUsage(
      (group.apiKeyId
        ? apiKeyNames.get(group.apiKeyId)
        : group.userId
          ? userNames.get(group.userId)
          : keySources.get(key)) ?? fallbackKeyName(group.authIndex),
      isAdmin,
      group.userId,
      group.userId ? userNames.get(group.userId) : undefined,
    ));
    const modelData = usage.models[group.model] ?? (usage.models[group.model] = {
      totalRequests: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    });
    modelData.totalRequests += toNumber(group._count?._all);
    modelData.totalTokens += toNumber(group._sum?.totalTokens);
    modelData.inputTokens += toNumber(group._sum?.inputTokens);
    modelData.outputTokens += toNumber(group._sum?.outputTokens);
    modelData.cachedTokens += toNumber(group._sum?.cachedTokens);
  }

  const dailyMap = new Map<string, {
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    success: number;
    failure: number;
  }>();
  for (const group of dailyGroupsResult) {
    const daily = dailyMap.get(group.date) ?? {
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      success: 0,
      failure: 0,
    };
    const requests = toNumber(group.requests);
    daily.requests += requests;
    daily.tokens += toNumber(group.tokens);
    daily.inputTokens += toNumber(group.inputTokens);
    daily.outputTokens += toNumber(group.outputTokens);
    daily.cachedTokens += toNumber(group.cachedTokens);
    if (group.failed) {
      daily.failure += requests;
    } else {
      daily.success += requests;
    }
    dailyMap.set(group.date, daily);
  }
  const dailyBreakdown = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));

  const modelBreakdown = modelGroupsResult
    .map((group) => ({
      model: group.model,
      requests: toNumber(group._count?._all),
      tokens: toNumber(group._sum?.totalTokens),
      cachedTokens: toNumber(group._sum?.cachedTokens),
    }))
    .sort((a, b) => b.requests - a.requests);

  const truncated = requestEventRows.length > REQUEST_EVENT_LIMIT;
  const requestEventSlice = truncated
    ? requestEventRows.slice(0, REQUEST_EVENT_LIMIT)
    : requestEventRows;
  const requestEvents: UsageRequestEvent[] = requestEventSlice.map((record) => ({
    timestamp: eventTimestamp(record.timestamp),
    keyName: eventKeyName(record),
    ...(isAdmin && record.user?.username ? { username: record.user.username } : {}),
    model: record.model,
    latencyMs: Math.max(0, toNumber(record.latencyMs)),
    totalTokens: toNumber(record.totalTokens),
    inputTokens: toNumber(record.inputTokens),
    outputTokens: toNumber(record.outputTokens),
    cachedTokens: toNumber(record.cachedTokens),
    failed: record.failed,
  }));
  const latencySeries: UsageLatencyPoint[] = latencyEventRows
    .map((record) => ({
      timestamp: eventTimestamp(record.timestamp),
      keyName: eventKeyName(record),
      ...(isAdmin && record.user?.username ? { username: record.user.username } : {}),
      model: record.model,
      latencyMs: Math.max(0, toNumber(record.latencyMs)),
      failed: record.failed,
    }))
    .reverse();

  const latencySummaryRow = latencySummaryRows[0];
  const latencySummary: UsageLatencySummary = {
    sampleCount: toNumber(latencySummaryRow?.sampleCount),
    averageMs: Math.round(toNumber(latencySummaryRow?.averageMs)),
    p95Ms: toNumber(latencySummaryRow?.p95Ms),
    maxMs: toNumber(latencySummaryRow?.maxMs),
  };

  return {
    keys: keyUsageMap,
    totals: {
      totalRequests,
      totalTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedTokens: totalCachedTokens,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
    },
    dailyBreakdown,
    modelBreakdown,
    requestEvents,
    latencySeries,
    latencySummary,
    collectorStatus: {
      lastCollectedAt: collectorState?.lastCollectedAt?.toISOString() ?? "",
      lastStatus: collectorState?.lastStatus ?? "unknown",
    },
    truncated,
  };
}
