export const zhCN = {
  "app.name": "Vercelwarden",
  "nav.vault": "密码库",
  "nav.generator": "生成器",
  "nav.sends": "Send",
  "nav.settings": "设置",
  "nav.admin": "管理控制台",
  "auth.login": "登录",
  "auth.register": "创建账号",
  "auth.lock": "锁定",
  "auth.logout": "退出账号",
  "common.save": "保存",
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.loading": "正在加载",
  "admin.users": "用户与邀请",
  "admin.logs": "审计日志",
  "admin.backup": "系统备份",
} as const;

export type TranslationKey = keyof typeof zhCN;
