"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Keyboard, ScanLine } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
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

  const accept = (input: string) => {
    try {
      parseTotpInput(input);
      onChange(input.trim());
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "无法识别 TOTP 内容。");
    }
  };

  const startCamera = async () => {
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setStream(next);
      setMode("camera");
      setError(null);
    } catch {
      setError("无法使用摄像头，请检查浏览器权限或改用图片/手动输入。");
    }
  };

  const scanFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    try { accept(await decodeTotpQrImage(blob)); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "当前画面未识别到二维码。"); }
  };

  return (
    <div className="vault-totp-capture">
      <div className="vault-totp-capture__actions">
        <Button size="sm" icon={Keyboard} variant={mode === "manual" ? "primary" : "secondary"} onClick={() => setMode("manual")}>手动</Button>
        <label className="vw-button vw-button--secondary vw-button--sm"><ImagePlus size={16} />图片<input type="file" accept="image/*" hidden onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try { accept(await decodeTotpQrImage(file)); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "二维码识别失败。"); }
          event.target.value = "";
        }} /></label>
        <Button size="sm" icon={Camera} onClick={() => void startCamera()}>摄像头</Button>
      </div>
      {mode === "manual" ? <Field label="TOTP 密钥"><Input value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => { if (value) accept(value); }} /></Field> : (
        <div className="vault-totp-capture__camera"><video ref={videoRef} autoPlay muted playsInline /><Button icon={ScanLine} onClick={() => void scanFrame()}>识别当前画面</Button></div>
      )}
      {error ? <p className="vw-field__error" role="alert">{error}</p> : null}
    </div>
  );
}
