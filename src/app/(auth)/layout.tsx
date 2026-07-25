export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="auth-shell">
      <header className="auth-brand" aria-label="Vercelwarden">
        <span className="brand-mark" aria-hidden="true">V</span>
        <span>Vercelwarden</span>
      </header>
      <div className="auth-content">{children}</div>
    </main>
  );
}
