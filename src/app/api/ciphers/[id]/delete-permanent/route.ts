import { createSingleLifecycleHandler } from "@/lib/server/vault/mutation-handlers";

export const DELETE = createSingleLifecycleHandler("delete-permanent");
export const PUT = DELETE;
