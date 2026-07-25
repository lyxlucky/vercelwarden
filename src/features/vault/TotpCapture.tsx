"use client";

import { useEffect, useRef, useState } from "react";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import KeyboardOutlined from "@mui/icons-material/KeyboardOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import { Alert, Box, Button, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { decodeTotpQrImage, parseTotpInput } from "@/lib/client/crypto/totp";

export function TotpCapture({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) video.srcObject = stream;
    return () => { if (video) video.srcObject = null; };
  }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  const stopCamera = () => { stream?.getTracks().forEach((track) => track.stop()); setStream(null); };
  const accept = (input: string) => {
    try { parseTotpInput(input); onChange(input.trim()); setError(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "无法识别 TOTP 内容。"); }
  };
  const startCamera = async () => {
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stopCamera(); setStream(next); setMode("camera"); setError(null);
    } catch { setError("无法使用摄像头，请检查浏览器权限或改用图片/手动输入。"); }
  };
  const scanFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    try { accept(await decodeTotpQrImage(blob)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "当前画面未识别到二维码。"); }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Box><Typography variant="subtitle2">一次性验证码</Typography><Typography variant="caption" color="text.secondary">手动输入密钥，或扫描身份验证器二维码</Typography></Box>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, next: "manual" | "camera" | null) => { if (!next) return; if (next === "manual") { stopCamera(); setMode("manual"); } else void startCamera(); }}>
            <ToggleButton value="manual" aria-label="手动"><KeyboardOutlined fontSize="small" sx={{ mr: 0.75 }} />手动</ToggleButton>
            <ToggleButton value="camera" aria-label="摄像头"><CameraAltOutlined fontSize="small" sx={{ mr: 0.75 }} />摄像头</ToggleButton>
          </ToggleButtonGroup>
          <Button component="label" size="small" variant="outlined" startIcon={<ImageOutlined />}>图片<input type="file" accept="image/*" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { accept(await decodeTotpQrImage(file)); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "二维码识别失败。"); } event.target.value = ""; }} /></Button>
        </Stack>
      </Stack>

      {mode === "manual" ? (
        <TextField label="TOTP 密钥" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => { if (value) accept(value); }} />
      ) : (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
          <Box component="video" ref={videoRef} autoPlay muted playsInline sx={{ width: "100%", maxHeight: 320, display: "block", objectFit: "cover", bgcolor: "common.black", borderRadius: 2 }} />
          <Button sx={{ mt: 1.5 }} variant="contained" startIcon={<QrCodeScannerOutlined />} onClick={() => void scanFrame()}>识别当前画面</Button>
        </Paper>
      )}
      {error ? <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert> : null}
    </Stack>
  );
}
