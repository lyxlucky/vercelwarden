import { NextResponse } from "next/server";
import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function isKnownDevice(email: string, identifier: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return new NextResponse("false", { headers: { "Content-Type": "text/plain" } });
  }
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.identifier, identifier), eq(devices.userUuid, user.uuid)))
    .limit(1);
  return new NextResponse(device ? "true" : "false", {
    headers: { "Content-Type": "text/plain" },
  });
}
