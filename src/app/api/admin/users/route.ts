import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { twoFactorCredentials, users } from "@/db/schema";
import { authorizeAdminRequest } from "@/lib/server/authorization/admin";
import { decodeAdminUserCursor, encodeAdminUserCursor } from "@/lib/server/admin/pagination";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

export async function GET(request: Request) {
  try {
    await authorizeAdminRequest(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.normalize("NFKC").trim().toLowerCase().slice(0, 200) ?? "";
    const status = url.searchParams.get("status") ?? "all";
    if (!new Set(["all", "active", "disabled"]).has(status)) {
      throw new ApiError(400, "validation_error", "The user status filter is invalid.");
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
    const cursor = decodeAdminUserCursor(url.searchParams.get("cursor"));
    const conditions: SQL[] = [];
    if (query) {
      const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(or(like(users.email, pattern), like(users.name, pattern), like(users.uuid, pattern))!);
    }
    if (status !== "all") conditions.push(eq(users.enabled, status === "active"));
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      conditions.push(or(
        lt(users.createdAt, createdAt),
        and(eq(users.createdAt, createdAt), lt(users.uuid, cursor.id))
      )!);
    }
    const page = await db.select().from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.uuid))
      .limit(limit + 1);
    const visible = page.slice(0, limit);
    const ids = visible.map((user) => user.uuid);
    const secondFactors = ids.length ? await db.select({ userUuid: twoFactorCredentials.userUuid })
      .from(twoFactorCredentials)
      .where(and(
        or(...ids.map((id) => eq(twoFactorCredentials.userUuid, id)))!,
        eq(twoFactorCredentials.status, "active")
      )) : [];
    const enabledTwoFactor = new Set(secondFactors.map((item) => item.userUuid));
    const last = visible.at(-1);
    return Response.json({
      data: visible.map((user) => ({
        id: user.uuid,
        email: user.email,
        name: user.name,
        role: user.role,
        enabled: user.enabled,
        emailVerified: Boolean(user.verifiedAt),
        twoFactorEnabled: Boolean(user.totpSecret) || enabledTwoFactor.has(user.uuid),
        creationDate: user.createdAt.toISOString(),
        revisionDate: user.updatedAt.toISOString(),
        object: "adminUser",
      })),
      continuationToken: page.length > limit && last
        ? encodeAdminUserCursor({ createdAt: last.createdAt.toISOString(), id: last.uuid })
        : null,
      object: "list",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
