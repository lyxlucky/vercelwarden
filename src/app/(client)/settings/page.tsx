import { Stack } from "@mui/material";
import { RouteGuard } from "@/components/shell/RouteGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PreferencesPanel } from "@/features/preferences/PreferencesPanel";

export default function SettingsPage() {
  return (
    <RouteGuard>
      <Stack component="main" id="main-content" spacing={3} sx={{ minWidth: 0 }}>
        <PageHeader title="本机偏好" description="细致定制主题、显示密度与可访问性。所有设置只保存在当前浏览器，不包含账号机密。" />
        <PreferencesPanel />
      </Stack>
    </RouteGuard>
  );
}
