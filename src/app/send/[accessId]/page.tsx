"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutlineOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  LinearProgress,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useParams } from "next/navigation";
import { BrandLockup } from "@/components/brand/BrandLogo";
import { PageTransition } from "@/components/motion/PageTransition";
import {
  accessPublicSend,
  downloadPublicSendFile,
  PublicSendAccessError,
  type PublicSend,
  type SendTransferProgress,
} from "@/features/sends/api";
import { wipeBytes } from "@/lib/client/crypto/auth";

const progressLabels: Record<SendTransferProgress["phase"], string> = {
  encrypting: "正在加密",
  uploading: "正在上传",
  downloading: "正在下载",
  decrypting: "正在本地解密",
  complete: "已完成",
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 }).format(value)} ${units[unitIndex]}`;
}

export default function PublicSendPage() {
  const params = useParams<{ accessId: string }>();
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [result, setResult] = useState<PublicSend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState<SendTransferProgress | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"success" | "error" | null>(null);
  const automaticAttempt = useRef<string | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (result?.type === "file") wipeBytes(result.sendKey);
  }, [result]);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const open = useCallback(async (attemptPassword?: string) => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const send = await accessPublicSend(params.accessId, window.location.hash.slice(1), attemptPassword);
      setResult(send);
      setPasswordRequired(false);
    } catch (nextError) {
      if (nextError instanceof PublicSendAccessError && (nextError.code === "password_required" || nextError.code === "invalid_password")) {
        setPasswordRequired(true);
        setError(nextError.code === "invalid_password" ? nextError.message : null);
        return;
      }
      setError(nextError instanceof Error ? nextError.message : "无法打开分享。");
    } finally {
      setBusy(false);
    }
  }, [params.accessId]);

  useEffect(() => {
    const attemptKey = `${params.accessId}:${window.location.hash}`;
    if (automaticAttempt.current === attemptKey) return;
    automaticAttempt.current = attemptKey;
    void open();
  }, [open, params.accessId]);

  const download = async (send: Extract<PublicSend, { type: "file" }>) => {
    setBusy(true);
    setError(null);
    try {
      await downloadPublicSendFile(params.accessId, send, password || undefined, setProgress);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "下载失败。");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("success");
    } catch {
      setCopyFeedback("error");
    }
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyFeedback(null), 2_400);
  };

  return (
    <Box
      component="main"
      sx={(theme) => ({
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        position: "relative",
        overflow: "hidden",
        px: 2,
        py: { xs: 3, sm: 6 },
        bgcolor: "background.default",
        backgroundImage: `radial-gradient(circle at 15% 10%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 34%), radial-gradient(circle at 85% 90%, ${alpha(theme.palette.success.main, 0.08)}, transparent 30%)`,
      })}
    >
      <Container maxWidth="md" disableGutters sx={{ position: "relative", zIndex: 1 }}>
        <Stack spacing={{ xs: 2, sm: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, px: { xs: 0.5, sm: 1 } }}>
            <BrandLockup subtitle="安全分享" markSize={42} />
            <Chip icon={<LockOutlined />} label="端到端加密" size="small" color="success" variant="outlined" sx={{ bgcolor: (theme) => alpha(theme.palette.success.main, 0.06), fontWeight: 650 }} />
          </Stack>

          <PageTransition>
            <Card
              variant="outlined"
              sx={{
                overflow: "hidden",
                borderColor: "divider",
                boxShadow: "0 24px 80px rgba(15, 23, 42, 0.12)",
              }}
            >
            {busy && (result?.type === "file" || progress) ? <LinearProgress aria-label={progress ? `${progressLabels[progress.phase]} ${progress.percent}%` : "正在处理分享"} variant={progress ? "determinate" : "indeterminate"} value={progress?.percent} /> : null}
            <CardContent sx={{ p: { xs: 2.5, sm: 4.5 } }}>
              {!result && busy && !passwordRequired ? (
                <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center", py: { xs: 4, sm: 6 } }} aria-live="polite">
                  <Box sx={{ width: 72, height: 72, display: "grid", placeItems: "center", position: "relative", borderRadius: "50%", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08) }}>
                    <LockOutlined color="primary" sx={{ fontSize: 32 }} aria-hidden="true" />
                    <CircularProgress size={72} thickness={2} sx={{ position: "absolute", inset: 0 }} aria-label="正在打开安全分享" />
                  </Box>
                  <Box>
                    <Typography component="h1" variant="h1">正在安全打开分享</Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>解密在你的设备上完成，请稍候。</Typography>
                  </Box>
                </Stack>
              ) : null}

              {!result && passwordRequired ? (
                <Box component="form" onSubmit={(event) => { event.preventDefault(); void open(password); }}>
                  <Stack spacing={3}>
                    <Box sx={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 3, color: "primary.main", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) }}>
                      <LockOutlined sx={{ fontSize: 28 }} aria-hidden="true" />
                    </Box>
                    <Box>
                      <Typography component="h1" variant="h1">此分享受密码保护</Typography>
                      <Typography color="text.secondary" sx={{ mt: 1 }}>请输入发送者提供的访问密码。解密密钥仍只保存在当前链接中。</Typography>
                    </Box>
                    {error ? <Alert severity="error">{error}</Alert> : null}
                    <TextField
                      autoFocus
                      label="访问密码"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title={passwordVisible ? "隐藏密码" : "显示密码"}>
                                <IconButton edge="end" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} onClick={() => setPasswordVisible((visible) => !visible)} sx={{ cursor: "pointer" }}>
                                  {passwordVisible ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <Button type="submit" variant="contained" size="large" disabled={busy || !password} startIcon={<LockOutlined />} sx={{ cursor: busy || !password ? "default" : "pointer" }}>
                      {busy ? "正在打开…" : "打开分享"}
                    </Button>
                  </Stack>
                </Box>
              ) : null}

              {!result && !busy && !passwordRequired ? (
                <Stack spacing={3} sx={{ alignItems: "flex-start", py: { xs: 2, sm: 3 } }}>
                  <Box sx={{ width: 56, height: 56, display: "grid", placeItems: "center", borderRadius: 3, color: "error.main", bgcolor: (theme) => alpha(theme.palette.error.main, 0.1) }}>
                    <LockOutlined sx={{ fontSize: 28 }} aria-hidden="true" />
                  </Box>
                  <Box>
                    <Typography component="h1" variant="h1">无法打开此分享</Typography>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>{error ?? "分享链接暂时不可用。"}</Typography>
                  </Box>
                  <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={() => void open()} sx={{ cursor: "pointer" }}>重试</Button>
                </Stack>
              ) : null}

              {result ? (
                <Stack spacing={{ xs: 3, sm: 3.5 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="overline" color="primary.main" sx={{ fontWeight: 750 }}>{result.type === "text" ? "文本分享" : "文件分享"}</Typography>
                      <Typography component="h1" variant="h1" sx={{ mt: 0.25, overflowWrap: "anywhere" }}>{result.name}</Typography>
                    </Box>
                    <Chip icon={<CheckCircleOutline />} label="已安全解密" color="success" size="small" sx={{ fontWeight: 650 }} />
                  </Stack>

                  {result.type === "text" ? (
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.025) }}>
                      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>分享内容</Typography>
                        <Button
                          size="small"
                          variant={copyFeedback === "success" ? "contained" : "text"}
                          color={copyFeedback === "success" ? "success" : "primary"}
                          startIcon={copyFeedback === "success" ? <CheckCircleOutline /> : <ContentCopyOutlined />}
                          onClick={() => void copyText(result.text)}
                          sx={{ cursor: "pointer" }}
                        >
                          {copyFeedback === "success" ? "已复制" : "复制文本"}
                        </Button>
                      </Stack>
                      <Box component="pre" aria-label="分享文本" tabIndex={0} sx={{ m: 0, p: { xs: 2, sm: 2.5 }, maxHeight: "55dvh", minHeight: 120, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace', fontSize: "0.9375rem", lineHeight: 1.7, color: "text.primary", userSelect: "text" }}>{result.text || "（空文本）"}</Box>
                    </Box>
                  ) : null}

                  {result.type === "file" ? (
                    <Stack spacing={2.5}>
                      <Stack direction="row" spacing={2} sx={{ alignItems: "center", p: { xs: 2, sm: 2.5 }, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.025) }}>
                        <Box sx={{ width: 52, height: 52, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 2.5, color: "primary.main", bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) }}>
                          <InsertDriveFileOutlined aria-hidden="true" />
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{result.file.fileName}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{formatBytes(result.file.size)}</Typography>
                        </Box>
                      </Stack>
                      <Button variant="contained" size="large" startIcon={<DownloadOutlined />} disabled={busy} onClick={() => void download(result)} sx={{ cursor: busy ? "default" : "pointer" }}>
                        {busy ? "正在处理…" : "下载并解密"}
                      </Button>
                      {progress ? (
                        <Stack spacing={1} aria-live="polite">
                          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
                            <Typography variant="body2" color="text.secondary">{progressLabels[progress.phase]}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{progress.percent}%</Typography>
                          </Stack>
                          <LinearProgress variant="determinate" value={progress.percent} />
                        </Stack>
                      ) : null}
                    </Stack>
                  ) : null}

                  {error ? <Alert severity="error">{error}</Alert> : null}
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary", pt: 0.5 }}>
                    <ShieldOutlined sx={{ fontSize: 18 }} aria-hidden="true" />
                    <Typography variant="caption">内容已在本地解密，链接中的密钥不会发送到服务器。</Typography>
                  </Stack>
                </Stack>
              ) : null}
            </CardContent>
            </Card>
          </PageTransition>
        </Stack>
      </Container>
      <Snackbar open={copyFeedback !== null} autoHideDuration={2_400} onClose={() => setCopyFeedback(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={copyFeedback === "error" ? "error" : "success"} variant="filled" onClose={() => setCopyFeedback(null)}>
          {copyFeedback === "error" ? "复制失败，请手动选择文本复制。" : "分享文本已复制"}
        </Alert>
      </Snackbar>
    </Box>
  );
}
