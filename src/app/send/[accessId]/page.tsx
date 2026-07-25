"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button, Field, Input } from "@/components/primitives";
import {
  accessPublicSend,
  downloadPublicSendFile,
  type PublicSend,
  type SendTransferProgress,
} from "@/features/sends/api";
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
    setBusy(true); setError(null); setProgress(null);
    try {
      if (result?.type === "file") wipeBytes(result.sendKey);
      setResult(await accessPublicSend(params.accessId, location.hash.slice(1), password));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "无法打开分享。"); }
    finally { setBusy(false); }
  };

  return <main className="public-send"><section className="tool-card"><h1>{result?.name ?? "打开安全分享"}</h1>
    {error && <p className="tool-error" role="alert">{error}</p>}
    {!result && <><p>如果分享设置了访问密码，请在下方输入；解密密钥只保存在 URL 片段中。</p><Field label="访问密码（可选）"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Button variant="primary" disabled={busy} onClick={open}>解密查看</Button></>}
    {result?.type === "text" && <pre>{result.text}</pre>}
    {result?.type === "file" && <div><p>{result.file.fileName} · {result.file.size.toLocaleString("zh-CN")} 字节</p><Button variant="primary" icon={Download} disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await downloadPublicSendFile(params.accessId, result, setProgress); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "下载失败。"); } finally { setBusy(false); } }}>下载并解密</Button>{progress && <p aria-live="polite">{progress.phase}：{progress.percent}%</p>}</div>}
  </section></main>;
}
