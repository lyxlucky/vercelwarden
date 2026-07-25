"use client";

import { useState, type ReactNode } from "react";
import {
  CheckOutlined,
  ContentCopyOutlined,
  FavoriteOutlined,
  OpenInNewOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
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
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { TaskState } from "@/components/feedback/TaskState";
import type { VaultItemView } from "@/features/vault/store";
import { verifyMasterPassword } from "@/features/auth/api";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function typeLabel(type: number) {
  return ["密码库项目", "登录", "安全笔记", "银行卡", "身份信息", "SSH 密钥", "银行账户", "驾驶证", "护照"][type] ?? "密码库项目";
}

function DetailSection({ title, label, children }: { title: string; label?: string; children: ReactNode }) {
  return (
    <Box component="section" aria-label={label}>
      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

export function VaultDetail({ item, onEdit }: { item: VaultItemView | null; onEdit?(item: VaultItemView): void }) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState<(() => void | Promise<void>) | null>(null);
  const [repromptPassword, setRepromptPassword] = useState("");
  const [repromptError, setRepromptError] = useState<string | null>(null);
  const [repromptBusy, setRepromptBusy] = useState(false);

  if (!item) return <Box sx={{ p: 2 }}><TaskState kind="empty" title="选择一个项目" description="从列表中选择项目以查看详情。" /></Box>;

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
      setCopyError("浏览器拒绝了剪贴板访问，请手动选择并复制。 ");
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
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5, minWidth: 0 }}>
          <Typography component="code" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontFamily: "monospace" }}>{shown ? value : "••••••••••••"}</Typography>
          <Tooltip title={`${shown ? "隐藏" : "显示"}${label}`}>
            <IconButton size="small" aria-label={`${shown ? "隐藏" : "显示"}${label}`} onClick={() => authorizeSensitive(() => reveal(field))}>
              {shown ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
            </IconButton>
          </Tooltip>
          {copyButton(field, label, value)}
        </Stack>
      </Paper>
    );
  };

  return (
    <>
      <Box component="article" sx={{ width: "100%", maxWidth: 920, mx: "auto", p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Stack component="header" direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}>
              <Avatar variant="rounded" sx={{ bgcolor: "primary.main" }}>{item.name.slice(0, 1).toLocaleUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h1" variant="h1" noWrap>{item.name}</Typography>
                <Typography color="text.secondary">{typeLabel(item.type)}</Typography>
              </Box>
            </Stack>
            {item.favorite ? <Chip icon={<FavoriteOutlined />} color="error" label="收藏" size="small" /> : null}
          </Stack>

          {copyError ? <Alert severity="warning" onClose={() => setCopyError(null)}>{copyError}</Alert> : null}

          {(item.username || item.password || item.uris.length > 0) ? (
            <DetailSection title="账号" label="账号详情">
              {secretRow("username", "用户名", item.username)}
              {secretRow("password", "密码", item.password)}
              {item.uris.map((uri, index) => (
                <Paper variant="outlined" sx={{ p: 1.25 }} key={`${uri}-${index}`}>
                  <Typography variant="caption" color="text.secondary">网站</Typography>
                  <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                    <Link href={uri} target="_blank" rel="noreferrer" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{uri}</Link>
                    <Tooltip title="打开网站"><IconButton size="small" component="a" href={uri} target="_blank" rel="noreferrer" aria-label="打开网站"><OpenInNewOutlined /></IconButton></Tooltip>
                    {copyButton(`uri-${index}`, "网站", uri)}
                  </Stack>
                </Paper>
              ))}
            </DetailSection>
          ) : null}

          {item.details.length > 0 ? <DetailSection title={`${typeLabel(item.type)}详情`} label="类型详情">{item.details.map((field, index) => secretRow(`detail-${index}`, field.name || "字段", field.value))}</DetailSection> : null}
          {item.customFields.length > 0 ? <DetailSection title="自定义字段" label="自定义字段">{item.customFields.map((field, index) => secretRow(`custom-${index}`, field.name || "字段", field.value))}</DetailSection> : null}
          {item.attachments.length > 0 ? (
            <DetailSection title="附件" label="附件">{item.attachments.map((attachment) => (
              <Paper variant="outlined" sx={{ p: 1.25 }} key={attachment.id}><Typography sx={{ fontWeight: 650 }}>{attachment.fileName}</Typography><Typography variant="body2" color="text.secondary">{attachment.size.toLocaleString()} bytes</Typography></Paper>
            ))}</DetailSection>
          ) : null}
          {item.passwordHistory.length > 0 ? (
            <DetailSection title="密码历史" label="密码历史">{item.passwordHistory.map((entry, index) => (
              <Paper variant="outlined" sx={{ p: 1.25 }} key={`${entry.lastUsedDate ?? "unknown"}-${index}`}>
                <Typography variant="caption" color="text.secondary">{entry.lastUsedDate ? formatDate(entry.lastUsedDate) : "未知日期"}</Typography>
                <Stack direction="row" sx={{ alignItems: "center" }}><Typography component="code" sx={{ flex: 1 }}>••••••••••••</Typography>{copyButton(`history-${index}`, "历史密码", entry.password)}</Stack>
              </Paper>
            ))}</DetailSection>
          ) : null}
          {item.notes ? <DetailSection title="备注"><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.notes}</Typography></DetailSection> : null}
          <DetailSection title="时间信息" label="时间信息">
            <Stack direction={{ xs: "column", sm: "row" }} divider={<Divider flexItem orientation="vertical" />} sx={{ gap: 2 }}>
              <Typography variant="body2"><strong>创建：</strong>{formatDate(item.createdAt)}</Typography>
              <Typography variant="body2"><strong>修改：</strong>{formatDate(item.updatedAt)}</Typography>
            </Stack>
          </DetailSection>
          <Box component="footer"><Button variant="contained" disabled={!onEdit} onClick={() => onEdit?.(item)}>编辑项目</Button></Box>
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
