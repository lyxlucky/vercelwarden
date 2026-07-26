import { notFound } from "next/navigation";
import { VaultShellFixture } from "@/app/__ui-test__/vault-shell/VaultShellFixture";

export const dynamic = "force-dynamic";

export default function VaultShellFixturePage() {
  if (process.env.ENABLE_UI_TEST_ROUTES !== "true") notFound();
  return <VaultShellFixture />;
}

