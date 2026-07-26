"use client";

import { useState, type ReactNode } from "react";
import {
  ArchiveOutlined,
  CheckOutlined,
  ContentCopyOutlined,
  DeleteOutlineOutlined,
  EditOutlined,
  FavoriteBorderOutlined,
  FavoriteOutlined,
  HistoryOutlined,
  InsertDriveFileOutlined,
  OpenInNewOutlined,
  RestoreOutlined,
  ScheduleOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
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
import { alpha } from "@mui/material/styles";
import { TaskState } from "@/components/feedback/TaskState";
import { verifyMasterPassword } from "@/features/auth/api";
import type { VaultItemView } from "@/features/vault/store";
import { VaultItemAvatar, VaultSection, vaultTypeLabel } from "@/features/vault/VaultVisuals";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FieldRow({ label, value, actions, mono = false }: { label: string; value: ReactNode; actions?: ReactNode; mono?: boolean }) {
  return (
    <Stack
      direction="row"
      sx={{
        minHeight: 64,
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 1,
        borderRadius: 0,
        borderLeft: 3,
        borderColor: "divider",
        bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.055 : 0.035),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25, fontWeight: 650 }}>{label}</Typography>
        <Typography component={mono ? "code" : "div"} sx={{ overflowWrap: "anywhere", fontFamily: mono ? '"Roboto Mono", "SFMono-Regular", Consolas, monospace' : undefined, fontSize: mono ? "0.9rem" : undefined }}>{value}</Typography>
      </Box>
      {actions ? <Stack direction="row" sx={{ alignItems: "center", flex: "0 0 auto" }}>{actions}</Stack> : null}
    </Stack>
  );
}

export type VaultDetailAction = "favorite" | "archive" | "unarchive" | "trash" | "restore" | "permanent";

export function VaultDetail({ item, onEdit, onAction }: {
  item: VaultItemView | null;
  onEdit?(item: VaultItemView): void;
  onAction?(action: VaultDetailAction, item: VaultItemView): void;
}) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
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

  const reveal = (field: string) => setVisible((current) => {
    const next = new Set(current);
    if (next.has(field)) next.delete(field); else next.add(field);
    return next;
  });
  const copy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(null);
      setCopied(field);
      window.setTimeout(() => setCopied((current) => current === field ? null : current), 1800);
    } catch {
      setCopyError("浏览器拒绝了剪贴板访问，请手动选择并复制。");
    }
  };
  const authorizeSensitive = (action: () => void | Promise<void>) => {
    if (item.reprompt !== 1) { void action(); return; }
    setPendingSensitiveAction(() => action);
    setRepromptPassword("");
    setRepromptError(null);
  };
  const copyButton = (field: string, label: string, value: string) => (
    <Tooltip title={`${copied === field ? "已复制" : "复制"}${label}`}>
      <IconButton size="small" aria-label={`${copied === field ? "已复制" : "复制"}${label}`} onClick={() => authorizeSensitive(() => copy(field, value))}>
        {copied === field ? <CheckOutlined color="success" /> : <ContentCopyOutlined />}
      </IconButton>
    </Tooltip>
  );
  const secretRow = (field: string, label: string, value: string) => {
    if (!value) return null;
    const shown = visible.has(field);
    return (
      <FieldRow
        key={field}
        label={label}
        mono
        value={shown ? value : "••••••••••••"}
        actions={(
          <>
            <Tooltip title={`${shown ? "隐藏" : "显示"}${label}`}>
              <IconButton size="small" aria-label={`${shown ? "隐藏" : "显示"}${label}`} onClick={() => authorizeSensitive(() => reveal(field))}>
                {shown ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
              </IconButton>
            </Tooltip>
            {copyButton(field, label, value)}
          </>
        )}
      />
    );
  };

  return (
    <>
      <Box component="article" sx={{ width: "100%", maxWidth: 960, mx: "auto", px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={2.5}>
          <Stack component="header" direction={{ xs: "column", sm: "row" }} sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 2, py: { xs: 1, sm: 1.5 }, borderBottom: 1, borderColor: "divider", pb: 2.5 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 2, minWidth: 0 }}>
              <VaultItemAvatar type={item.type} size={56} />
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography component="h1" variant="h1" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography>
                  {item.favorite ? <Chip icon={<FavoriteOutlined />} color="error" label="收藏" size="small" variant="outlined" /> : null}
                </Stack>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>{vaultTypeLabel(item.type)}</Typography>
              </Box>
            </Stack>
            <Stack direction="row" sx={{ alignSelf: { xs: "stretch", sm: "center" }, gap: 1, flexWrap: "wrap" }}>
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

          {copyError ? <Alert severity="warning" onClose={() => setCopyError(null)}>{copyError}</Alert> : null}

          {(item.username || item.password || item.uris.length > 0) ? (
            <VaultSection title="账号" description="登录凭据与关联网站">
              <Stack spacing={1}>
                {secretRow("username", "用户名", item.username)}
                {secretRow("password", "密码", item.password)}
                {item.uris.map((uri, index) => (
                  <FieldRow
                    key={`${uri}-${index}`}
                    label="网站"
                    value={<Link href={uri} target="_blank" rel="noreferrer">{uri}</Link>}
                    actions={(
                      <>
                        <Tooltip title="打开网站"><IconButton size="small" component="a" href={uri} target="_blank" rel="noreferrer" aria-label="打开网站"><OpenInNewOutlined /></IconButton></Tooltip>
                        {copyButton(`uri-${index}`, "网站", uri)}
                      </>
                    )}
                  />
                ))}
              </Stack>
            </VaultSection>
          ) : null}

          {item.details.length > 0 ? <VaultSection title={`${vaultTypeLabel(item.type)}详情`}><Stack spacing={1}>{item.details.map((field, index) => secretRow(`detail-${index}`, field.name || "字段", field.value))}</Stack></VaultSection> : null}
          {item.customFields.length > 0 ? <VaultSection title="自定义字段"><Stack spacing={1}>{item.customFields.map((field, index) => secretRow(`custom-${index}`, field.name || "字段", field.value))}</Stack></VaultSection> : null}

          {item.attachments.length > 0 ? (
            <VaultSection title="附件" description={`${item.attachments.length} 个加密文件`}>
              <Stack spacing={1}>{item.attachments.map((attachment) => (
                <FieldRow key={attachment.id} label={formatBytes(attachment.size)} value={attachment.fileName} actions={<InsertDriveFileOutlined color="action" />} />
              ))}</Stack>
            </VaultSection>
          ) : null}

          {item.passwordHistory.length > 0 ? (
            <VaultSection title="密码历史" description="历史密码默认保持隐藏">
              <Stack spacing={1}>{item.passwordHistory.map((entry, index) => (
                <FieldRow key={`${entry.lastUsedDate ?? "unknown"}-${index}`} label={entry.lastUsedDate ? formatDate(entry.lastUsedDate) : "未知日期"} mono value="••••••••••••" actions={copyButton(`history-${index}`, "历史密码", entry.password)} />
              ))}</Stack>
            </VaultSection>
          ) : null}

          {item.notes ? <VaultSection title="备注"><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.75 }}>{item.notes}</Typography></VaultSection> : null}

          <VaultSection title="时间信息">
            <Stack direction={{ xs: "column", sm: "row" }} divider={<Divider flexItem orientation="vertical" />} sx={{ gap: 2 }}>
              <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1 }}><ScheduleOutlined color="action" /><Box><Typography variant="caption" color="text.secondary">创建</Typography><Typography variant="body2">{formatDate(item.createdAt)}</Typography></Box></Stack>
              <Stack direction="row" sx={{ gap: 1, alignItems: "center", flex: 1 }}><HistoryOutlined color="action" /><Box><Typography variant="caption" color="text.secondary">最后修改</Typography><Typography variant="body2">{formatDate(item.updatedAt)}</Typography></Box></Stack>
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
