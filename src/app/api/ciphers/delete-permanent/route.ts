import { createBulkLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const PUT = createBulkLifecycleHandler("delete-permanent", "delete-permanent");
export const POST = PUT;
export const DELETE = PUT;
