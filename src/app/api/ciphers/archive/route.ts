import { createBulkLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const PUT = createBulkLifecycleHandler("archive", "archive");
export const POST = PUT;
