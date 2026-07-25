"use client";

import { useState } from "react";
import { Check, MapPin, ShieldQuestion, X } from "lucide-react";
import { Button, Dialog } from "@/components/primitives";
import {
  approveAuthRequest,
  respondToAuthRequest,
  type AuthRequestSummary,
} from "@/features/devices/api";

export function AuthRequestApproval({
  requests,
  busy,
  onBusyChange,
  onHandled,
  onError,
}: {
  requests: AuthRequestSummary[];
  busy: boolean;
  onBusyChange(value: boolean): void;
  onHandled(): Promise<void> | void;
  onError(message: string): void;
}) {
  const [decision, setDecision] = useState<{ request: AuthRequestSummary; approved: boolean } | null>(null);
  const handle = async (request: AuthRequestSummary, approved: boolean) => {
    onBusyChange(true); onError("");
    try {
      if (approved) await approveAuthRequest(request);
      else await respondToAuthRequest(request.id, false);
      setDecision(null);
      await onHandled();
    } catch (error) {
      onError(error instanceof Error ? error.message : "登录请求处理失败。");
    } finally {
      onBusyChange(false);
    }
  };
  if (requests.length === 0) return <p>没有待处理登录请求。</p>;
  return <><div className="settings-list">{requests.map((request) => <article className="auth-request" key={request.id}>
    <div className="auth-request__title"><ShieldQuestion size={20} aria-hidden="true" /><div><strong>{request.requestDeviceIdentifier}</strong><span>{new Date(request.creationDate).toLocaleString()}</span></div></div>
    <p><MapPin size={15} aria-hidden="true" />{[request.countryCode, request.ipAddress].filter(Boolean).join(" · ") || "位置未知"}</p>
    <div className="auth-request__fingerprint"><span>指纹短语</span><code>{request.fingerprintPhrase}</code></div>
    <div className="settings-actions"><Button icon={X} disabled={busy} variant="danger" onClick={() => setDecision({ request, approved: false })}>拒绝</Button><Button icon={Check} disabled={busy} variant="primary" onClick={() => setDecision({ request, approved: true })}>批准</Button></div>
  </article>)}</div><Dialog open={decision !== null} onOpenChange={(open) => { if (!open && !busy) setDecision(null); }} title={decision?.approved ? "确认批准登录" : "确认拒绝登录"} description="请在操作前再次核对设备、位置和指纹短语。" footer={<><Button disabled={busy} onClick={() => setDecision(null)}>取消</Button><Button icon={decision?.approved ? Check : X} variant={decision?.approved ? "primary" : "danger"} disabled={busy || !decision} onClick={() => { if (decision) void handle(decision.request, decision.approved); }}>{decision?.approved ? "确认批准" : "确认拒绝"}</Button></>}>
    {decision ? <div className="auth-request"><div className="auth-request__title"><ShieldQuestion size={20} aria-hidden="true" /><div><strong>{decision.request.requestDeviceIdentifier}</strong><span>{new Date(decision.request.creationDate).toLocaleString()}</span></div></div><p><MapPin size={15} aria-hidden="true" />{[decision.request.countryCode, decision.request.ipAddress].filter(Boolean).join(" · ") || "位置未知"}</p><div className="auth-request__fingerprint"><span>指纹短语</span><code>{decision.request.fingerprintPhrase}</code></div></div> : null}
  </Dialog></>;
}
