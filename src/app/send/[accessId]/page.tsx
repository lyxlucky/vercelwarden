"use client";

import { useEffect, useState } from "react";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { Alert, Box, Button, Card, CardContent, Container, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { accessPublicSend, downloadPublicSendFile, type PublicSend, type SendTransferProgress } from "@/features/sends/api";
import { wipeBytes } from "@/lib/client/crypto/auth";

export default function PublicSendPage() {
  const params = useParams<{ accessId: string }>();
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<PublicSend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SendTransferProgress | null>(null);

  useEffect(() => () => { if (result?.type === "file") wipeBytes(result.sendKey); }, [result]);

  const open = async () => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      if (result?.type === "file") wipeBytes(result.sendKey);
      setResult(await accessPublicSend(params.accessId, location.hash.slice(1), password));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "无法打开分享。");
    } finally {
      setBusy(false);
    }
  };

  const download = async (send: Extract<PublicSend, { type: "file" }>) => {
    setBusy(true);
    setError(null);
    try {
      await downloadPublicSendFile(params.accessId, send, setProgress);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "下载失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="main" id="main-content" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", py: 4, bgcolor: "background.default" }}>
      <Container maxWidth="sm">
        <Card variant="outlined" sx={{ animation: "vw-public-enter 240ms cubic-bezier(0, 0, 0.2, 1)", "@keyframes vw-public-enter": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } }, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}>
          {busy ? <LinearProgress aria-label={progress ? `${progress.phase} ${progress.percent}%` : "正在解密分享"} variant={progress ? "determinate" : "indeterminate"} value={progress?.percent} /> : null}
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Stack spacing={3}>
              <PageHeader title={result?.name ?? "打开安全分享"} description={!result ? "解密密钥只保存在 URL 片段中，不会发送到服务器。" : undefined} actions={<LockOutlined color="primary" aria-hidden="true" />} />
              {error ? <Alert severity="error">{error}</Alert> : null}
              {!result ? (
                <Stack spacing={2}>
                  <Typography color="text.secondary">如果分享设置了访问密码，请在下方输入。</Typography>
                  <TextField label="访问密码（可选）" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  <Button variant="contained" disabled={busy} onClick={() => void open()}>解密查看</Button>
                </Stack>
              ) : null}
              {result?.type === "text" ? (
                <Box component="pre" aria-label="分享文本" sx={{ m: 0, p: 2, borderRadius: 3, bgcolor: "action.hover", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>{result.text}</Box>
              ) : null}
              {result?.type === "file" ? (
                <Stack spacing={2}>
                  <Alert severity="info">{result.file.fileName} · {result.file.size.toLocaleString("zh-CN")} 字节</Alert>
                  <Button variant="contained" startIcon={<DownloadOutlined />} disabled={busy} onClick={() => void download(result)}>下载并解密</Button>
                  {progress ? <Box aria-live="polite"><Typography variant="body2">{progress.phase}：{progress.percent}%</Typography><LinearProgress variant="determinate" value={progress.percent} /></Box> : null}
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
