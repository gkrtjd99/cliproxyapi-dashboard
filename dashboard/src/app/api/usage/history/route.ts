import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { usageCache } from "@/lib/cache";
import { Errors } from "@/lib/errors";
import { aggregateUsageHistory } from "@/lib/usage/history-aggregation";

// Cache for 5 seconds to allow frequent polling without overwhelming the database
// The frontend polls every 60 seconds, so 5s cache won't cause missed updates
const USAGE_HISTORY_CACHE_TTL_MS = 5_000;

function isValidDateParam(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const [year, month, day] = dateString.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

export async function GET(request: NextRequest) {
  const requestStartedAt = Date.now();
  const session = await verifySession();
  if (!session) {
    return Errors.unauthorized();
  }

  const searchParams = request.nextUrl.searchParams;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (!fromParam || !toParam) {
    return Errors.missingFields(["from", "to"]);
  }

  if (!isValidDateParam(fromParam) || !isValidDateParam(toParam)) {
    return Errors.validation("Invalid date format. Use YYYY-MM-DD.");
  }

  const [fromYear, fromMonth, fromDay] = fromParam.split("-").map(Number) as [number, number, number];
  const [toYear, toMonth, toDay] = toParam.split("-").map(Number) as [number, number, number];
  const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
  const toDate = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999);

  if (fromDate > toDate) {
    return Errors.validation("from date must be before to date");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isAdmin: true, username: true },
    });
    const isAdmin = user?.isAdmin ?? false;
    const cacheKey = `usage-history:v2:${session.userId}:${isAdmin ? "admin" : "user"}:${fromParam}:${toParam}`;
    const cached = usageCache.get(cacheKey) as { data: unknown; isAdmin: boolean } | null;
    if (cached) {
      logger.debug({ userId: session.userId, from: fromParam, to: toParam }, "Usage history cache hit");
      return NextResponse.json(cached);
    }

    let sourceFilter: string[] = [];
    if (!isAdmin) {
      const oauthOwnerships = await prisma.providerOAuthOwnership.findMany({
        where: { userId: session.userId },
        select: { accountName: true, accountEmail: true },
      });
      sourceFilter = [];
      if (user?.username) sourceFilter.push(user.username);
      for (const o of oauthOwnerships) {
        if (o.accountEmail) sourceFilter.push(o.accountEmail);
        sourceFilter.push(o.accountName);
      }
    }

    const whereClause = {
      timestamp: {
        gte: fromDate,
        lte: toDate,
      },
      // Admins can inspect all collected traffic, including OAuth auth-file
      // usage where apiKeyId is null. Non-admins are restricted to records
      // attributed to their account or owned OAuth source.
      ...(isAdmin
        ? {}
        : {
            OR: [
              { userId: session.userId },
              ...(sourceFilter.length > 0
                ? [{ source: { in: sourceFilter } }]
                : []),
            ],
          }),
    };

    const aggregatedUsage = await aggregateUsageHistory({
      db: prisma,
      whereClause,
      fromDate,
      toDate,
      isAdmin,
      sessionUserId: session.userId,
      sourceFilter,
    });

    const responseData = {
      data: {
        ...aggregatedUsage,
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
      isAdmin,
    };

    usageCache.set(cacheKey, responseData, USAGE_HISTORY_CACHE_TTL_MS);
    logger.info(
      {
        userId: session.userId,
        isAdmin,
        from: fromParam,
        to: toParam,
        recordCount: aggregatedUsage.totals.totalRequests,
        truncated: aggregatedUsage.truncated,
        durationMs: Date.now() - requestStartedAt,
      },
      "Usage history request completed"
    );

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error({ err: error, userId: session.userId, durationMs: Date.now() - requestStartedAt }, "Failed to fetch usage history");
    return Errors.internal("Failed to fetch usage history");
  }
}
