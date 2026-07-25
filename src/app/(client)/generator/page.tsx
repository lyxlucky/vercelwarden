"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Tabs } from "@/components/primitives";
import { RouteGuard } from "@/components/shell/RouteGuard";
import {
  defaultPassphraseOptions,
  defaultPasswordOptions,
  generatePassphrase,
  generatePassword,
  passwordStrength,
} from "@/features/generator/generator";

export default function GeneratorPage() {
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [passwordOptions, setPasswordOptions] = useState(defaultPasswordOptions);
  const [passphraseOptions, setPassphraseOptions] = useState(defaultPassphraseOptions);
  const [seed, setSeed] = useState(0);
  const [copied, setCopied] = useState(false);
  const generated = useMemo(() => {
    void seed;
    return mode === "password" ? generatePassword(passwordOptions) : generatePassphrase(passphraseOptions);
  }, [mode, passphraseOptions, passwordOptions, seed]);
  const strength = passwordStrength(generated, mode === "passphrase" ? 7_776 : undefined);
  const copy = async () => {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <RouteGuard><main className="tool-page"><header className="tool-page__header"><div><Link href="/vault">← 返回密码库</Link><h1>密码生成器</h1><p>全部生成过程仅在当前设备内完成，不会自动保存。</p></div><ShieldCheck size={28} /></header>
    <section className="tool-card generator-result"><code>{generated}</code><div><Button icon={RefreshCw} onClick={() => setSeed((value) => value + 1)}>重新生成</Button><Button variant="primary" icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? "已复制" : "复制"}</Button></div><p>强度：<strong>{strength.label}</strong> · 估算 {Math.round(strength.entropy)} bits</p></section>
    <section className="tool-card"><Tabs.Root value={mode} defaultValue="password" onValueChange={(value) => setMode(value as typeof mode)}><Tabs.List><Tabs.Trigger value="password">密码</Tabs.Trigger><Tabs.Trigger value="passphrase">密码短语</Tabs.Trigger></Tabs.List>
      <Tabs.Panel value="password" className="tool-options"><Field label="长度"><Input type="number" min={5} max={256} value={passwordOptions.length} onChange={(event) => setPasswordOptions({ ...passwordOptions, length: Number(event.target.value) })} /></Field>
        {(["uppercase", "lowercase", "numbers", "special"] as const).map((key) => <label className="tool-check" key={key}><input type="checkbox" checked={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: event.target.checked })} />{{ uppercase: "大写字母", lowercase: "小写字母", numbers: "数字", special: "特殊字符" }[key]}</label>)}
        <label className="tool-check"><input type="checkbox" checked={passwordOptions.avoidAmbiguous} onChange={(event) => setPasswordOptions({ ...passwordOptions, avoidAmbiguous: event.target.checked })} />排除易混淆字符</label>
        {(["minimumUppercase", "minimumLowercase", "minimumNumbers", "minimumSpecial"] as const).map((key) => <Field key={key} label={{ minimumUppercase: "最少大写", minimumLowercase: "最少小写", minimumNumbers: "最少数字", minimumSpecial: "最少特殊字符" }[key]}><Input type="number" min={0} max={passwordOptions.length} value={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: Number(event.target.value) })} /></Field>)}
      </Tabs.Panel>
      <Tabs.Panel value="passphrase" className="tool-options"><Field label="单词数量"><Input type="number" min={3} max={20} value={passphraseOptions.words} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, words: Number(event.target.value) })} /></Field><Field label="分隔符"><Input maxLength={1} value={passphraseOptions.separator} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, separator: event.target.value })} /></Field><label className="tool-check"><input type="checkbox" checked={passphraseOptions.capitalize} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, capitalize: event.target.checked })} />单词首字母大写</label><label className="tool-check"><input type="checkbox" checked={passphraseOptions.includeNumber} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, includeNumber: event.target.checked })} />包含数字</label></Tabs.Panel>
    </Tabs.Root></section>
  </main></RouteGuard>;
}
