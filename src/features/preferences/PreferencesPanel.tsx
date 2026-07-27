"use client";

import { useEffect, useRef, useState } from "react";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  DEFAULT_APPEARANCE,
  type AppearancePreferences,
} from "@/components/theme/appearance";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  loadPreferences,
  savePreferences,
  type ClientPreferences,
} from "@/lib/client/state/preferences";

const accentOptions = [
  { value: "periwinkle", label: "品牌紫蓝", color: "#4b5dd9" },
  { value: "indigo", label: "靛蓝", color: "#5268d4" },
  { value: "blue", label: "蓝色", color: "#2563c7" },
  { value: "cyan", label: "青蓝", color: "#087f9c" },
  { value: "teal", label: "青绿", color: "#0e9e8c" },
  { value: "green", label: "绿色", color: "#2f7d4d" },
  { value: "amber", label: "琥珀", color: "#a86408" },
  { value: "rose", label: "玫红", color: "#b54864" },
] as const;

const radiusMarks = [
  { value: 4, label: "利落" },
  { value: 10, label: "均衡" },
  { value: 16, label: "柔和" },
];

const fontScaleMarks = [
  { value: 0.9, label: "90%" },
  { value: 1, label: "100%" },
  { value: 1.15, label: "115%" },
];

export function PreferencesPanel() {
  const [preferences, setPreferences] = useState<ClientPreferences>(loadPreferences);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(statusTimer.current);
  }, []);

  const announce = (message: string) => {
    setStatus(message);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(""), 2400);
  };

  const persist = (next: ClientPreferences, message: string) => {
    setPreferences(next);
    savePreferences(next);
    announce(message);
  };

  const updateAppearance = (patch: Partial<AppearancePreferences>) => {
    persist({
      ...preferences,
      appearance: { ...preferences.appearance, ...patch },
    }, "外观已自动保存");
  };

  const resetAppearance = () => {
    persist({ ...preferences, appearance: { ...DEFAULT_APPEARANCE } }, "外观已恢复默认值");
  };

  const saveGeneralPreferences = () => persist(preferences, "本机偏好已保存");
  const appearance = preferences.appearance;

  return (
    <Stack spacing={3}>
      <Box role="status" aria-live="polite" sx={{ minHeight: 24 }}>
        {status ? <Alert severity="success" sx={{ py: 0 }}>{status}</Alert> : null}
      </Box>

      <SectionCard
        title="主题与强调色"
        description="外观调整会即时应用并自动保存在当前浏览器。账号密钥和密码数据不会进入主题配置。"
        action={<Button size="small" variant="text" startIcon={<RestartAltOutlined />} onClick={resetAppearance}>恢复默认</Button>}
      >
        <Stack spacing={3}>
          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>明暗模式</Typography>
            <ToggleButtonGroup
              exclusive
              value={preferences.theme}
              onChange={(_event, theme: ClientPreferences["theme"] | null) => {
                if (theme !== null) persist({ ...preferences, theme }, "主题模式已自动保存");
              }}
              aria-label="明暗模式"
              fullWidth
            >
              <ToggleButton value="system">跟随系统</ToggleButton>
              <ToggleButton value="light">浅色</ToggleButton>
              <ToggleButton value="dark">深色</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography component="h3" variant="subtitle2">强调色</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, mb: 1.5 }}>用于主要操作、焦点、选中项和链接；状态色仍保持独立语义。</Typography>
            <Stack direction="row" sx={{ gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
              {accentOptions.map((option) => {
                const selected = appearance.accent === option.value;
                return (
                  <Tooltip key={option.value} title={option.label}>
                    <ButtonBase
                      aria-label={`使用${option.label}强调色`}
                      aria-pressed={selected}
                      onClick={() => updateAppearance({ accent: option.value })}
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        bgcolor: option.color,
                        color: "#fff",
                        border: "3px solid",
                        borderColor: selected ? "text.primary" : "transparent",
                        boxShadow: selected ? (theme) => `0 0 0 2px ${theme.palette.background.paper}` : "none",
                        transition: (theme) => theme.transitions.create(
                          ["border-color", "box-shadow"],
                          { duration: theme.transitions.duration.shorter },
                        ),
                        "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 3 },
                      }}
                    >
                      {selected ? <CheckOutlined fontSize="small" /> : null}
                    </ButtonBase>
                  </Tooltip>
                );
              })}
              <TextField
                label="自定义"
                type="color"
                value={appearance.customAccent}
                onChange={(event) => updateAppearance({ accent: "custom", customAccent: event.target.value })}
                slotProps={{
                  htmlInput: { "aria-label": "自定义强调色" },
                  inputLabel: { shrink: true },
                }}
                sx={{ width: 112, "& input": { minHeight: 24, cursor: "pointer", paddingBlock: 0.75 } }}
              />
            </Stack>
          </Box>

          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>中性色调</Typography>
            <ToggleButtonGroup
              exclusive
              value={appearance.neutralTone}
              onChange={(_event, neutralTone: AppearancePreferences["neutralTone"] | null) => {
                if (neutralTone !== null) updateAppearance({ neutralTone });
              }}
              aria-label="中性色调"
              fullWidth
            >
              <ToggleButton value="cool">冷灰</ToggleButton>
              <ToggleButton value="neutral">中性灰</ToggleButton>
              <ToggleButton value="warm">暖灰</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="形状、密度与层次" description="这些令牌会统一作用于按钮、输入框、卡片、对话框、菜单和页面间距。">
        <Stack spacing={3.5}>
          <Box>
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
              <Typography component="h3" variant="subtitle2">组件圆角</Typography>
              <Chip size="small" variant="outlined" label={`${appearance.radius}px`} />
            </Stack>
            <Slider
              aria-label="组件圆角"
              min={4}
              max={16}
              step={1}
              marks={radiusMarks}
              value={appearance.radius}
              valueLabelDisplay="auto"
              onChange={(_event, value) => updateAppearance({ radius: value as number })}
              sx={{ mt: 1, px: 0.5 }}
            />
            <FormHelperText sx={{ mx: 0 }}>默认 10px，属于适度圆润；调高后容器圆角也会按比例增大。</FormHelperText>
          </Box>

          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>界面密度</Typography>
            <ToggleButtonGroup
              exclusive
              value={appearance.density}
              onChange={(_event, density: AppearancePreferences["density"] | null) => {
                if (density !== null) updateAppearance({ density });
              }}
              aria-label="界面密度"
              fullWidth
            >
              <ToggleButton value="compact">紧凑</ToggleButton>
              <ToggleButton value="balanced">均衡</ToggleButton>
              <ToggleButton value="comfortable">舒适</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
              <Typography component="h3" variant="subtitle2">全局字号</Typography>
              <Chip size="small" variant="outlined" label={`${Math.round(appearance.fontScale * 100)}%`} />
            </Stack>
            <Slider
              aria-label="全局字号"
              min={0.9}
              max={1.15}
              step={0.05}
              marks={fontScaleMarks}
              value={appearance.fontScale}
              valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              valueLabelDisplay="auto"
              onChange={(_event, value) => updateAppearance({ fontScale: value as number })}
              sx={{ mt: 1, px: 0.5 }}
            />
          </Box>

          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>表面层次</Typography>
            <ToggleButtonGroup
              exclusive
              value={appearance.surfaceStyle}
              onChange={(_event, surfaceStyle: AppearancePreferences["surfaceStyle"] | null) => {
                if (surfaceStyle !== null) updateAppearance({ surfaceStyle });
              }}
              aria-label="表面层次"
              fullWidth
            >
              <ToggleButton value="outlined">描边</ToggleButton>
              <ToggleButton value="soft">轻柔</ToggleButton>
              <ToggleButton value="elevated">浮起</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="可访问性" description="高对比度会增强文字、边界和焦点提示；减少动效不会影响功能。">
        <Stack spacing={2.5}>
          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>对比度</Typography>
            <ToggleButtonGroup
              exclusive
              value={appearance.contrast}
              onChange={(_event, contrast: AppearancePreferences["contrast"] | null) => {
                if (contrast !== null) updateAppearance({ contrast });
              }}
              aria-label="对比度"
              fullWidth
            >
              <ToggleButton value="standard">标准</ToggleButton>
              <ToggleButton value="high">增强</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>界面动效</Typography>
            <ToggleButtonGroup
              exclusive
              value={appearance.motion}
              onChange={(_event, motion: AppearancePreferences["motion"] | null) => {
                if (motion !== null) updateAppearance({ motion });
              }}
              aria-label="界面动效"
              fullWidth
            >
              <ToggleButton value="system">跟随系统</ToggleButton>
              <ToggleButton value="reduced">减少动效</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </SectionCard>

      <SectionCard title="实时预览" description="预览使用与应用其他页面完全相同的全局 MUI 主题。">
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 2,
            bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.055 : 0.025),
          }}
        >
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1.5, alignItems: { sm: "center" } }}>
              <Box>
                <Typography variant="h6">密码库示例</Typography>
                <Typography variant="body2" color="text.secondary">中性表面、清晰层次、稳定的状态反馈</Typography>
              </Box>
              <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                <Chip color="success" label="已同步" size="small" />
                <Chip variant="outlined" label="个人" size="small" />
              </Stack>
            </Stack>
            <TextField label="项目名称" value="示例登录项" slotProps={{ htmlInput: { readOnly: true } }} />
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              <Button variant="contained">主要操作</Button>
              <Button variant="outlined">次要操作</Button>
              <Button variant="text">文本操作</Button>
            </Stack>
          </Stack>
        </Paper>
      </SectionCard>

      <SectionCard title="语言与安全超时" description="这些偏好在点击保存后生效，并且只保存在当前浏览器。">
        <Stack spacing={2.25}>
          <FormControl>
            <InputLabel id="locale-label">语言</InputLabel>
            <Select labelId="locale-label" label="语言" value={preferences.locale} onChange={(event) => setPreferences({ ...preferences, locale: event.target.value as ClientPreferences["locale"] })}>
              <MenuItem value="zh-CN">简体中文</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel id="timeout-label">空闲锁定时间</InputLabel>
            <Select labelId="timeout-label" label="空闲锁定时间" value={preferences.lockTimeoutMs} onChange={(event) => setPreferences({ ...preferences, lockTimeoutMs: Number(event.target.value) })}>
              <MenuItem value={60_000}>1 分钟</MenuItem>
              <MenuItem value={5 * 60_000}>5 分钟</MenuItem>
              <MenuItem value={15 * 60_000}>15 分钟</MenuItem>
              <MenuItem value={30 * 60_000}>30 分钟</MenuItem>
              <MenuItem value={60 * 60_000}>1 小时</MenuItem>
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel id="timeout-action-label">超时动作</InputLabel>
            <Select labelId="timeout-action-label" label="超时动作" value={preferences.timeoutAction} onChange={(event) => setPreferences({ ...preferences, timeoutAction: event.target.value as ClientPreferences["timeoutAction"] })}>
              <MenuItem value="lock">锁定</MenuItem>
              <MenuItem value="logout">退出账号</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<SaveOutlined />} onClick={saveGeneralPreferences} sx={{ alignSelf: "flex-start" }}>保存本机偏好</Button>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
