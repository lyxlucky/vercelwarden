"use client";

import { useEffect, useRef, useState } from "react";
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
import { ActionGroup } from "@/components/ui/ActionGroup";
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

function isIntegerInRange(value: string, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

export default function GeneratorPage() {
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [passwordOptions, setPasswordOptions] = useState(defaultPasswordOptions);
  const [passphraseOptions, setPassphraseOptions] = useState(defaultPassphraseOptions);
  const [lengthInput, setLengthInput] = useState(String(defaultPasswordOptions.length));
  const [wordsInput, setWordsInput] = useState(String(defaultPassphraseOptions.words));
  const [lengthTouched, setLengthTouched] = useState(false);
  const [wordsTouched, setWordsTouched] = useState(false);
  const [seed, setSeed] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [generated, setGenerated] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const copyAttempt = useRef(0);
  const copyTimeout = useRef<number | undefined>(undefined);
  const validLength = isIntegerInRange(lengthInput, 5, 256);
  const validWords = isIntegerInRange(wordsInput, 3, 20);
  const validInput = mode === "password" ? validLength : validWords;

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      void seed;
      setCopyState("idle");
      setGenerationError(null);
      if (!validInput) {
        setGenerated("");
        return;
      }

      try {
        setGenerated(mode === "password"
          ? generatePassword({ ...passwordOptions, length: Number(lengthInput) })
          : generatePassphrase({ ...passphraseOptions, words: Number(wordsInput) }));
      } catch (error) {
        setGenerated("");
        setGenerationError(generatorErrorMessage(error));
      }
    });

    return () => {
      cancelled = true;
      copyAttempt.current += 1;
      window.clearTimeout(copyTimeout.current);
    };
  }, [lengthInput, mode, passphraseOptions, passwordOptions, seed, validInput, wordsInput]);
  const strength = validInput && generated
    ? mode === "password"
      ? passwordStrength(generated)
      : passphraseStrength({ ...passphraseOptions, words: Number(wordsInput) })
    : null;

  const copy = async () => {
    if (!validInput || !generated) return;
    const attempt = ++copyAttempt.current;
    window.clearTimeout(copyTimeout.current);

    try {
      await navigator.clipboard.writeText(generated);
      if (attempt !== copyAttempt.current) return;
      setCopyState("copied");
      copyTimeout.current = window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      if (attempt === copyAttempt.current) setCopyState("error");
    }
  };

  return (
    <RouteGuard>
      <ToolPageShell
        title="密码生成器"
        description="全部生成过程仅在当前设备内完成，不会自动保存。"
        actions={<Chip icon={<ShieldOutlined />} label="仅本地生成" color="success" variant="outlined" />}
        feedback={generationError ? <Alert severity="warning">{generationError}</Alert> : undefined}
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
              {validInput && generated ? generated : "等待生成…"}
            </Box>
            <ActionGroup mobileStack>
              <Button disabled={!validInput} startIcon={<RefreshOutlined />} onClick={() => setSeed((value) => value + 1)}>重新生成</Button>
              <Button disabled={!validInput || !generated} variant="contained" startIcon={copyState === "copied" ? <CheckOutlined /> : <ContentCopyOutlined />} onClick={() => void copy()}>
                {copyState === "copied" ? "已复制" : "复制"}
              </Button>
            </ActionGroup>
            {copyState === "error" ? <Alert severity="error">无法访问剪贴板，请手动选择并复制结果。</Alert> : null}
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
                <TextField
                  label="长度"
                  type="number"
                  slotProps={{ htmlInput: { min: 5, max: 256 } }}
                  value={lengthInput}
                  onChange={(event) => { setLengthInput(event.target.value); setLengthTouched(false); }}
                  onBlur={() => setLengthTouched(true)}
                  error={lengthTouched && !validLength}
                  helperText="请输入 5 到 256 之间的整数。"
                />
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1 }}>
                  {passwordFlags.map(([key, label]) => (
                    <FormControlLabel key={key} control={<Checkbox checked={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: event.target.checked })} />} label={label} />
                  ))}
                  <FormControlLabel control={<Checkbox checked={passwordOptions.avoidAmbiguous} onChange={(event) => setPasswordOptions({ ...passwordOptions, avoidAmbiguous: event.target.checked })} />} label="排除易混淆字符" />
                </Box>
                <Typography variant="subtitle2">最低字符数量</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 2 }}>
                  {minimumFields.map(([key, label]) => (
                    <TextField key={key} label={label} type="number" slotProps={{ htmlInput: { min: 0, max: validLength ? Number(lengthInput) : undefined } }} value={passwordOptions[key]} onChange={(event) => setPasswordOptions({ ...passwordOptions, [key]: Number(event.target.value) })} />
                  ))}
                </Box>
              </Stack>
            ) : (
              <Stack spacing={2.5}>
                <TextField
                  label="单词数量"
                  type="number"
                  slotProps={{ htmlInput: { min: 3, max: 20 } }}
                  value={wordsInput}
                  onChange={(event) => { setWordsInput(event.target.value); setWordsTouched(false); }}
                  onBlur={() => setWordsTouched(true)}
                  error={wordsTouched && !validWords}
                  helperText="请输入 3 到 20 之间的整数。"
                />
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
