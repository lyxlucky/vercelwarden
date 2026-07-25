import { NetworkStatus } from "@/components/shell/NetworkStatus";

export default function ClientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="client-root"><NetworkStatus />{children}</div>;
}
