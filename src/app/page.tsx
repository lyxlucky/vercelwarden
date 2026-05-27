export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">Vercelwarden</h1>
        <p className="text-gray-400 text-lg mb-8">
          Self-hosted Bitwarden-compatible password manager on Vercel
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/admin"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition"
          >
            Admin Panel
          </a>
          <a
            href="https://github.com/your-username/vercelwarden"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition"
          >
            GitHub
          </a>
        </div>
        <div className="mt-12 text-gray-500 text-sm">
          <p>Compatible with Bitwarden browser extensions, desktop, mobile, and web vault</p>
          <p className="mt-2">API base: <code className="text-gray-400">/api</code></p>
        </div>
      </div>
    </div>
  );
}
