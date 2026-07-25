import type { TranslationKey } from "./zh-CN";

export const en = {
  "app.name": "Vercelwarden",
  "nav.vault": "Vault",
  "nav.generator": "Generator",
  "nav.sends": "Send",
  "nav.settings": "Settings",
  "nav.admin": "Admin console",
  "auth.login": "Log in",
  "auth.register": "Create account",
  "auth.lock": "Lock",
  "auth.logout": "Log out",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.loading": "Loading",
  "admin.users": "Users and invitations",
  "admin.logs": "Audit logs",
  "admin.backup": "System backups",
} as const satisfies Record<TranslationKey, string>;
