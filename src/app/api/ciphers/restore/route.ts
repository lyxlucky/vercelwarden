import { createBulkLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const PUT = createBulkLifecycleHandler("restore", "restore");
export const POST = PUT;
