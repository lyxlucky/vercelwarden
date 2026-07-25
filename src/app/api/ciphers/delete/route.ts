import { createBulkLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const PUT = createBulkLifecycleHandler("trash", "trash");
export const POST = PUT;
export const DELETE = PUT;
