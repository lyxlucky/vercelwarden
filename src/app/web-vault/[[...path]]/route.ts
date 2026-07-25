const LEGACY_ROUTES: Record<string, string> = {
  "": "/login",
  login: "/login",
  register: "/register",
  vault: "/vault",
  generator: "/generator",
  sends: "/sends",
  settings: "/settings",
  tools: "/generator",
};

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const firstSegment = path[0]?.toLowerCase() ?? "";
  const destination = LEGACY_ROUTES[firstSegment] ?? "/login";
  return Response.redirect(new URL(destination, request.url), 307);
}
