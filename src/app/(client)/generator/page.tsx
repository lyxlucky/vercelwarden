"use client";

import { useEffect, useState } from "react";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import ShieldOutlined from "@mui/icons-material/ShieldOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { SectionCard } from "@/components/ui/SectionCard";
import { ToolPageShell } from "@/components/ui/ToolPageShell";
import {
  defaultPassphraseOptions,
  defaultPasswordOptions,
  generatePassphrase,
  generatePassword,
  passphraseStrength,
  passwordStrength,
} from "@/features/generator/generator";

const passwordFlags = [
  ["uppercase", "大写字母"],
  ["lowercase", "小写字母"],
  ["numbers", "数字"],
  ["special", "特殊字符"],
] as const;

const minimumFields = [
  ["minimumUppercase", "最少大写"],
  ["minimumLowercase", "最少小写"],
  ["minimumNumbers", "最少数字"],
  ["minimumSpecial", "最少特殊字符"],
] as const;

function generatorErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "生成选项无效。";

  const messages: Record<string, string> = {
    "Password length must be between 5 and 256.": "密码长度必须在 5 到 256 之间。",
    "Enable at least one character group.": "至少启用一个字符组。",
    "Minimum counts cannot be negative.": "最低字符数量必须是非负整数。",
    "Minimum character counts exceed password length.": "最低字符数量总和不能超过密码长度。",
    "Passphrase word count must be between 3 and 20.": "密码短语的单词数量必须在 3 到 20 之间。",
    "Passphrase separator must be one character or empty.": "分隔符只能是一个字符或留空。",
  };

  return messages[error.message] ?? "无法按当前选项生成，请检查设置。";
}

export default function GeneratorPage() {
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [passwordOptions, setPasswordOptions] = useState(defaultPasswordOptions);
  const [passphraseOptions, setPassphraseOptions] = useState(defaultPassphraseOptions);
  const [seed, setSeed] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [generated, setGenerated] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      void seed;
      try {
        setGenerated(mode === "password" ? generatePassword(passwordOptions) : generatePassphrase(passphraseOptions));
        setGenerationError(null);
      } catch (error) {
        setGenerated("");
        setGenerationError(generatorErrorMessage(error));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, passphraseOptions, passwordOptions, seed]);
  const strength = generated
    ? mode === "password"
      ? passwordStrength(generated)
      : passphraseStrength(passphraseOptions)
    : null;

  const copy = async () => {
    if (!generated) return;

    try {
      await navigator.clipboard.writeText(generated);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <RouteGuard>
      <ToolPageShell
        title="密码生成器"
        description="全部生成过程仅在当前设备内完成，不会自动保存。"
        actions={<Chip icon={<ShieldOutlined />} label="仅本地生成" color="success" variant="outlined" />}
        feedback={generationError
          ? <Alert severity="warning">{generationError}</Alert>
          : copyState === "error"
            ? <Alert severity="error">浏览器拒绝了剪贴板权限，请手动选择并复制结果。</Alert>
            : undefined}
      >
        <SectionCard
          title="生成结果"
          description={strength ? `强度：${strength.label} · 估算 ${Math.round(strength.entropy)} bits` : "请检查生成选项"}
        >
          <Stack spacing={2}>
            <Box
              component="output"
              aria-label="生成结果"
              sx={{
                display: "block",
                p: { xs: 2, sm: 2.5 },
                borderRadius: 3,
                bgcolor: "action.hover",
                fontFamily: "monospace",
                fontSize: { xs: "1rem", sm: "1.2rem" },
                overflowWrap: "anywhere",
                userSelect: "all",
              }}
            >
              {generated || "等待生成…"}
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button startIcon={<RefreshOutlined />} onClick={() => setSeed((value) => value + 1)}>重新生成</Button>
              <Button disabled={!generated} variant="contained" startIcon={copyState === "copied" ? <CheckOutlined /> : <ContentCopyOutlined />} onClick={() => void copy()}>
                {copyState === "copied" ? "已复制" : "复制"}
              </Button>
            </Stack>
          </Stack>
        </SectionCard>

        <SectionCard title="生成选项">
          <Tabs value={mode} onChange={(_, value: "password" | "passphrase") => setMode(value)} aria-label="生成器类型">
            <Tab value="password" label="密码" />
            <Tab value="passphrase" label="密码短语" />
          </Tabs>
          <Box role="tabpanel" aria-label={mode === "password" ? "密码选项" : "密码短语选项"} sx={{ pt: 3 }}>
            {mode === "password" ? (
              <Stack spacing={2.5}>
                <TextField label="长度" type="number" slotProps={{ htmlInput: { min: 5, max: 256 } }} value={passwordOptions.length} onChange={(event) => setPasswordOptions({ ...passwordOptions, length: Math.min(256, Math.max(5, Number(event.target.value) || 5)) })} />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1 }}>
                  {passwordFlags.map(([key, label]) => (
                    <FormControlLabel key={key} control={<Checkbox checked={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: event.target.checked })} />} label={label} />
                  ))}
                  <FormControlLabel control={<Checkbox checked={passwordOptions.avoidAmbiguous} onChange={(event) => setPasswordOptions({ ...passwordOptions, avoidAmbiguous: event.target.checked })} />} label="排除易混淆字符" />
                </Box>
                <Typography variant="subtitle2">最低字符数量</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
                  {minimumFields.map(([key, label]) => (
                    <TextField key={key} label={label} type="number" slotProps={{ htmlInput: { min: 0, max: passwordOptions.length } }} value={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: Number(event.target.value) })} />
                  ))}
                </Box>
              </Stack>
            ) : (
              <Stack spacing={2.5}>
                <TextField label="单词数量" type="number" slotProps={{ htmlInput: { min: 3, max: 20 } }} value={passphraseOptions.words} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, words: Math.min(20, Math.max(3, Number(event.target.value) || 3)) })} />
                <TextField label="分隔符" slotProps={{ htmlInput: { maxLength: 1 } }} value={passphraseOptions.separator} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, separator: event.target.value })} />
                <FormControlLabel control={<Checkbox checked={passphraseOptions.capitalize} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, capitalize: event.target.checked })} />} label="单词首字母大写" />
                <FormControlLabel control={<Checkbox checked={passphraseOptions.includeNumber} onChange={(event) => setPassphraseOptions({ ...passphraseOptions, includeNumber: event.target.checked })} />} label="包含数字" />
              </Stack>
            )}
          </Box>
        </SectionCard>
      </ToolPageShell>
    </RouteGuard>
  );
}
