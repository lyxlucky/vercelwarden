import { createBulkLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const PUT = createBulkLifecycleHandler("unarchive", "unarchive");
export const POST = PUT;
