"use client";

import { useState } from "react";
import {
  ArchiveOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  FavoriteBorderOutlined,
  FavoriteOutlined,
  HistoryOutlined,
  InsertDriveFileOutlined,
  OpenInNewOutlined,
  RestoreOutlined,
  ScheduleOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { TaskState } from "@/components/feedback/TaskState";
import { CopyButton, LedgerRow, SecretField, useCopy } from "@/components/ui/SecretField";
import { MONO_FONT } from "@/components/theme/theme";
import { verifyMasterPassword } from "@/features/auth/api";
import type { VaultItemView } from "@/features/vault/store";
import { VaultItemIcon, VaultSection, vaultTypeLabel } from "@/features/vault/VaultVisuals";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export type VaultDetailAction = "favorite" | "archive" | "unarchive" | "trash" | "restore" | "permanent";

export function VaultDetail({ item, onEdit, onAction }: {
  item: VaultItemView | null;
  onEdit?(item: VaultItemView): void;
  onAction?(action: VaultDetailAction, item: VaultItemView): void;
}) {
  const { copiedKey, copy, error: copyError, clearError } = useCopy();
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState<(() => void | Promise<void>) | null>(null);
  const [repromptPassword, setRepromptPassword] = useState("");
  const [repromptError, setRepromptError] = useState<string | null>(null);
  const [repromptBusy, setRepromptBusy] = useState(false);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);

  if (!item) {
    return (
      <Box sx={{ minHeight: "100%", display: "grid", placeItems: "center", p: 3 }}>
        <TaskState kind="empty" title="选择一个项目" description="从项目列表中选择一项，即可在这里安全查看详细信息。" />
      </Box>
    );
  }

  // Items flagged with reprompt require re-entering the master password before any
  // secret is revealed or copied. The action is stashed and replayed after verification.
  const authorizeSensitive = (action: () => void | Promise<void>) => {
    if (item.reprompt !== 1) { void action(); return; }
    setPendingSensitiveAction(() => action);
    setRepromptPassword("");
    setRepromptError(null);
  };

  return (
    <>
      <Box component="article" sx={{ width: "100%", maxWidth: 960, mx: "auto", px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 1.5, sm: 3 }, containerType: "inline-size", containerName: "vaultDetail" }}>
        <Stack spacing={2.5}>
          <Stack component="header" sx={{ flexDirection: "column", alignItems: "stretch", justifyContent: "space-between", gap: 2, py: { xs: 1, sm: 1.5 }, borderBottom: 1, borderColor: "divider", pb: 2.5, "@container vaultDetail (min-width: 560px)": { flexDirection: "row", alignItems: "center" } }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 2, minWidth: 0 }}>
              <VaultItemIcon type={item.type} uris={item.uris} size={56} />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="div" sx={{ fontFamily: MONO_FONT, fontSize: "0.66rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "text.secondary", mb: 0.25 }}>
                  {vaultTypeLabel(item.type)}
                </Typography>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography component="h1" variant="h1" sx={{ overflowWrap: "anywhere", fontSize: { xs: "1.35rem", sm: "1.6rem" }, lineHeight: 1.25 }}>{item.name}</Typography>
                  {item.favorite ? <Chip icon={<FavoriteOutlined />} color="error" label="收藏" size="small" variant="outlined" /> : null}
                </Stack>
              </Box>
            </Stack>
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignSelf: "stretch", "@container vaultDetail (min-width: 560px)": { alignSelf: "center" } }}>
              {item.deletedAt ? (
                <>
                  <Button variant="contained" startIcon={<RestoreOutlined />} onClick={() => onAction?.("restore", item)}>恢复项目</Button>
                  <Button variant="outlined" color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => onAction?.("permanent", item)}>永久删除</Button>
                </>
              ) : (
                <>
                  {item.archivedAt ? <Button variant="outlined" startIcon={<RestoreOutlined />} onClick={() => onAction?.("unarchive", item)}>取消归档</Button> : null}
                  <Button variant="contained" startIcon={<EditOutlined />} disabled={!onEdit} onClick={() => onEdit?.(item)}>编辑项目</Button>
                  <Button variant="outlined" color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => onAction?.("trash", item)}>移入回收站</Button>
                  <Button variant="text" aria-label="更多项目操作" onClick={(event) => setActionAnchor(event.currentTarget)}>更多</Button>
                </>
              )}
            </Stack>
          </Stack>

          <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={() => setActionAnchor(null)}>
            <MenuItem onClick={() => { setActionAnchor(null); onAction?.("favorite", item); }}>
              <ListItemIcon>{item.favorite ? <FavoriteOutlined fontSize="small" /> : <FavoriteBorderOutlined fontSize="small" />}</ListItemIcon>
              <ListItemText>{item.favorite ? "取消收藏" : "收藏"}</ListItemText>
            </MenuItem>
            {!item.archivedAt ? <MenuItem onClick={() => { setActionAnchor(null); onAction?.("archive", item); }}><ListItemIcon><ArchiveOutlined fontSize="small" /></ListItemIcon><ListItemText>归档</ListItemText></MenuItem> : null}
          </Menu>

          {copyError ? <Alert severity="warning" onClose={clearError}>{copyError}</Alert> : null}

          {(item.username || item.password || item.uris.length > 0) ? (
            <VaultSection title="账号" description="登录凭据与关联网站">
              <Stack spacing={1}>
                <SecretField label="用户名" fieldKey="username" value={item.username} secret copiedKey={copiedKey} onCopy={copy} authorize={authorizeSensitive} />
                <SecretField label="密码" fieldKey="password" value={item.password} secret copiedKey={copiedKey} onCopy={copy} authorize={authorizeSensitive} />
                {item.uris.map((uri, index) => (
                  <LedgerRow
                    key={`${uri}-${index}`}
                    label="网站"
                    actions={(
                      <>
                        <Tooltip title="打开网站"><IconButton size="small" component="a" href={uri} target="_blank" rel="noreferrer" aria-label="打开网站" sx={{ cursor: "pointer" }}><OpenInNewOutlined fontSize="small" /></IconButton></Tooltip>
                        <CopyButton copied={copiedKey === `uri-${index}`} label="网站" onCopy={() => copy(`uri-${index}`, uri)} />
                      </>
                    )}
                  >
                    <Link href={uri} target="_blank" rel="noreferrer" sx={{ fontFamily: MONO_FONT, fontSize: "0.9rem", overflowWrap: "anywhere" }}>{uri}</Link>
                  </LedgerRow>
                ))}
              </Stack>
            </VaultSection>
          ) : null}

          {item.details.length > 0 ? <VaultSection title={`${vaultTypeLabel(item.type)}详情`}><Stack spacing={1}>{item.details.map((field, index) => <SecretField key={`detail-${index}`} label={field.name || "字段"} fieldKey={`detail-${index}`} value={field.value} secret copiedKey={copiedKey} onCopy={copy} authorize={authorizeSensitive} />)}</Stack></VaultSection> : null}
          {item.customFields.length > 0 ? <VaultSection title="自定义字段"><Stack spacing={1}>{item.customFields.map((field, index) => <SecretField key={`custom-${index}`} label={field.name || "字段"} fieldKey={`custom-${index}`} value={field.value} secret copiedKey={copiedKey} onCopy={copy} authorize={authorizeSensitive} />)}</Stack></VaultSection> : null}

          {item.attachments.length > 0 ? (
            <VaultSection title="附件" description={`${item.attachments.length} 个加密文件`}>
              <Stack spacing={1}>{item.attachments.map((attachment) => (
                <LedgerRow key={attachment.id} label={formatBytes(attachment.size)} actions={<InsertDriveFileOutlined color="action" />}>
                  <Typography component="span" sx={{ overflowWrap: "anywhere" }}>{attachment.fileName}</Typography>
                </LedgerRow>
              ))}</Stack>
            </VaultSection>
          ) : null}

          {item.passwordHistory.length > 0 ? (
            <VaultSection title="密码历史" description="历史密码默认保持隐藏">
              <Stack spacing={1}>{item.passwordHistory.map((entry, index) => (
                <SecretField
                  key={`${entry.lastUsedDate ?? "unknown"}-${index}`}
                  label={entry.lastUsedDate ? formatDate(entry.lastUsedDate) : "未知日期"}
                  fieldKey={`history-${index}`}
                  value={entry.password}
                  secret
                  copiedKey={copiedKey}
                  onCopy={copy}
                  authorize={authorizeSensitive}
                />
              ))}</Stack>
            </VaultSection>
          ) : null}

          {item.notes ? <VaultSection title="备注"><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.75 }}>{item.notes}</Typography></VaultSection> : null}

          <VaultSection title="时间信息">
            <Stack direction={{ xs: "column", sm: "row" }} divider={<Divider flexItem orientation="vertical" />} sx={{ gap: 2 }}>
              <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1 }}><ScheduleOutlined color="action" /><Box><Typography variant="caption" color="text.secondary">创建</Typography><Typography variant="body2" sx={{ fontFamily: MONO_FONT }}>{formatDate(item.createdAt)}</Typography></Box></Stack>
              <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1 }}><HistoryOutlined color="action" /><Box><Typography variant="caption" color="text.secondary">最后修改</Typography><Typography variant="body2" sx={{ fontFamily: MONO_FONT }}>{formatDate(item.updatedAt)}</Typography></Box></Stack>
            </Stack>
          </VaultSection>
        </Stack>
      </Box>

      <Dialog open={pendingSensitiveAction !== null} onClose={() => { if (!repromptBusy) { setPendingSensitiveAction(null); setRepromptPassword(""); setRepromptError(null); } }}>
        <DialogTitle>确认主密码</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>此项目要求在查看或复制敏感字段前再次验证主密码。</DialogContentText>
          <TextField label="主密码" type="password" autoComplete="current-password" autoFocus value={repromptPassword} error={Boolean(repromptError)} helperText={repromptError} onChange={(event) => setRepromptPassword(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingSensitiveAction(null)} disabled={repromptBusy}>取消</Button>
          <Button variant="contained" disabled={repromptBusy || !repromptPassword} onClick={async () => {
            if (!pendingSensitiveAction) return;
            setRepromptBusy(true);
            setRepromptError(null);
            try {
              await verifyMasterPassword(repromptPassword);
              const action = pendingSensitiveAction;
              setPendingSensitiveAction(null);
              setRepromptPassword("");
              await action();
            } catch { setRepromptError("主密码不正确。"); } finally { setRepromptBusy(false); }
          }}>验证</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
