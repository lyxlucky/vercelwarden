"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, Heart } from "lucide-react";
import { Button, Dialog, Field, IconButton, Input } from "@/components/primitives";
import { TaskState } from "@/components/feedback/TaskState";
import type { VaultItemView } from "@/features/vault/store";
import { verifyMasterPassword } from "@/features/auth/api";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "未知"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function typeLabel(type: number) {
  if (type === 1) return "登录";
  if (type === 2) return "安全笔记";
  if (type === 3) return "银行卡";
  if (type === 4) return "身份信息";
  if (type === 5) return "SSH 密钥";
  if (type === 6) return "银行账户";
  if (type === 7) return "驾驶证";
  if (type === 8) return "护照";
  return "密码库项目";
}

export function VaultDetail({ item, onEdit }: { item: VaultItemView | null; onEdit?(item: VaultItemView): void }) {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingSensitiveAction, setPendingSensitiveAction] = useState<(() => void | Promise<void>) | null>(null);
  const [repromptPassword, setRepromptPassword] = useState("");
  const [repromptError, setRepromptError] = useState<string | null>(null);
  const [repromptBusy, setRepromptBusy] = useState(false);

  if (!item) {
    return <TaskState kind="empty" title="选择一个项目" description="从列表中选择项目以查看详情。" />;
  }

  const reveal = (field: string) => setVisible((current) => {
    const next = new Set(current);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    return next;
  });
  const copy = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied((current) => current === field ? null : current), 1800);
  };
  const authorizeSensitive = (action: () => void | Promise<void>) => {
    if (item.reprompt !== 1) {
      void action();
      return;
    }
    setPendingSensitiveAction(() => action);
    setRepromptPassword("");
    setRepromptError(null);
  };
  const copyButton = (field: string, label: string, value: string) => (
    <>
      <IconButton
        icon={copied === field ? Check : Copy}
        label={`${copied === field ? "已复制" : "复制"}${label}`}
        size="sm"
        onClick={() => authorizeSensitive(() => copy(field, value))}
      />
      {copied === field ? <small className="vault-detail__copied" role="status">已复制</small> : null}
    </>
  );
  const secretRow = (field: string, label: string, value: string) => {
    if (!value) return null;
    const shown = visible.has(field);
    return (
      <div className="vault-detail__field">
        <span>{label}</span>
        <div className="vault-detail__value">
          <code>{shown ? value : "••••••••••••"}</code>
          <IconButton icon={shown ? EyeOff : Eye} label={`${shown ? "隐藏" : "显示"}${label}`} size="sm" onClick={() => authorizeSensitive(() => reveal(field))} />
          {copyButton(field, label, value)}
        </div>
      </div>
    );
  };

  return (
    <>
    <article className="vault-detail">
      <header className="vault-detail__header">
        <div className="vault-detail__title">
          <span className="vault-detail__mark">{item.name.slice(0, 1).toLocaleUpperCase()}</span>
          <div><h1>{item.name}</h1><p>{typeLabel(item.type)}</p></div>
        </div>
        {item.favorite ? <Heart size={18} fill="currentColor" aria-label="收藏" /> : null}
      </header>

      {(item.username || item.password || item.uris.length > 0) ? (
        <section className="vault-detail__section" aria-label="账号详情">
          <h2>账号</h2>
          {secretRow("username", "用户名", item.username)}
          {secretRow("password", "密码", item.password)}
          {item.uris.map((uri, index) => (
            <div className="vault-detail__field" key={`${uri}-${index}`}>
              <span>网站</span>
              <div className="vault-detail__value">
                <a href={uri} target="_blank" rel="noreferrer">{uri}</a>
                <IconButton icon={ExternalLink} label="打开网站" size="sm" onClick={() => window.open(uri, "_blank", "noopener,noreferrer")} />
                {copyButton(`uri-${index}`, "网站", uri)}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {item.details.length > 0 ? (
        <section className="vault-detail__section" aria-label="类型详情">
          <h2>{typeLabel(item.type)}详情</h2>
          {item.details.map((field, index) => secretRow(`detail-${index}`, field.name || "字段", field.value))}
        </section>
      ) : null}

      {item.customFields.length > 0 ? (
        <section className="vault-detail__section" aria-label="自定义字段">
          <h2>自定义字段</h2>
          {item.customFields.map((field, index) => secretRow(`custom-${index}`, field.name || "字段", field.value))}
        </section>
      ) : null}

      {item.attachments.length > 0 ? (
        <section className="vault-detail__section" aria-label="附件">
          <h2>附件</h2>
          {item.attachments.map((attachment) => (
            <div className="vault-detail__field" key={attachment.id}>
              <span>{attachment.fileName}</span>
              <div className="vault-detail__value"><span>{attachment.size.toLocaleString()} bytes</span></div>
            </div>
          ))}
        </section>
      ) : null}

      {item.passwordHistory.length > 0 ? (
        <section className="vault-detail__section" aria-label="密码历史">
          <h2>密码历史</h2>
          {item.passwordHistory.map((entry, index) => (
            <div className="vault-detail__field" key={`${entry.lastUsedDate ?? "unknown"}-${index}`}>
              <span>{entry.lastUsedDate ? formatDate(entry.lastUsedDate) : "未知日期"}</span>
              <div className="vault-detail__value">
                <code>••••••••••••</code>
                {copyButton(`history-${index}`, "历史密码", entry.password)}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {item.notes ? <section className="vault-detail__section"><h2>备注</h2><p className="vault-detail__notes">{item.notes}</p></section> : null}

      <section className="vault-detail__section vault-detail__meta" aria-label="时间信息">
        <h2>时间信息</h2>
        <p><span>创建</span>{formatDate(item.createdAt)}</p>
        <p><span>修改</span>{formatDate(item.updatedAt)}</p>
      </section>
      <footer className="vault-detail__footer"><Button disabled={!onEdit} onClick={() => onEdit?.(item)}>编辑项目</Button></footer>
    </article>
    <Dialog
      open={pendingSensitiveAction !== null}
      onOpenChange={(open) => { if (!open) { setPendingSensitiveAction(null); setRepromptPassword(""); setRepromptError(null); } }}
      title="确认主密码"
      description="此项目要求在查看或复制敏感字段前再次验证主密码。"
      footer={(
        <>
          <Button onClick={() => setPendingSensitiveAction(null)}>取消</Button>
          <Button variant="primary" disabled={repromptBusy || !repromptPassword} onClick={async () => {
            if (!pendingSensitiveAction) return;
            setRepromptBusy(true);
            setRepromptError(null);
            try {
              await verifyMasterPassword(repromptPassword);
              const action = pendingSensitiveAction;
              setPendingSensitiveAction(null);
              setRepromptPassword("");
              await action();
            } catch {
              setRepromptError("主密码不正确。");
            } finally {
              setRepromptBusy(false);
            }
          }}>验证</Button>
        </>
      )}
    >
      <Field label="主密码" error={repromptError ?? undefined}><Input type="password" autoComplete="current-password" value={repromptPassword} onChange={(event) => setRepromptPassword(event.target.value)} /></Field>
    </Dialog>
    </>
  );
}
