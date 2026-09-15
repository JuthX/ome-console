import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/auth/session";
import { hasRole, type Role } from "@/auth/roles";
import { isSetupNeeded } from "@/lib/setupStatus";

// /api/admission-webhook is called directly by OME (no session cookie) —
// authenticated via X-OME-Signature inside the route itself instead.
const PUBLIC_PATHS = ["/login", "/api/admission-webhook"];

// Sprint 8a: PRD §10's role table, as a path/method rule list — first match
// wins, checked in order. Anything not matched defaults to "viewer" (any
// logged-in user), which is a safe default for a route a future sprint adds
// and forgets to classify here: visible to any authenticated user, never
// silently public, since the authentication check above already ran.
const ENGINEER_PAGES = ["/profiles", "/hosts", "/users", "/servers", "/audit", "/access-settings"];
const OPERATOR_PAGES = ["/push", "/rec", "/addinput", "/channels", "/access"];

function isUnderAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const RULES: { test: (pathname: string, method: string) => boolean; role: Role }[] = [
  // Engineer: profiles, hosts & apps, access settings, alert routing,
  // users/server registry/audit log.
  {
    test: (p) =>
      isUnderAny(p, ENGINEER_PAGES) ||
      p.startsWith("/api/apps/detail") ||
      p.startsWith("/api/vhosts") ||
      p.startsWith("/api/output-profiles") ||
      p.startsWith("/api/alert-routes") ||
      p.startsWith("/api/users") ||
      p.startsWith("/api/servers") ||
      p.startsWith("/api/audit") ||
      // Access settings (SignedPolicy/AdmissionWebhooks status + secret
      // rotation) moved to its own Engineer-only page in the UI sweep —
      // nothing Operator-facing calls this anymore.
      p.startsWith("/api/access-status") ||
      // Rotating the SignedPolicy secret is a Server.xml-level "access
      // settings" change (PRD §10, Engineer) even though everyday viewer-link
      // issuance below it is Operator-level.
      p.startsWith("/api/viewer-links/reissue"),
    role: "engineer",
  },
  { test: (p, m) => p === "/api/apps" && m === "PATCH", role: "engineer" },

  // Operator: push, record, LLHLS tools, keys, channels, stream actions.
  {
    test: (p) =>
      isUnderAny(p, OPERATOR_PAGES) ||
      p.startsWith("/api/push") ||
      p.startsWith("/api/record") ||
      p.startsWith("/api/hls-dump") ||
      p.startsWith("/api/stream-events") ||
      p.startsWith("/api/streams/") ||
      p.startsWith("/api/scheduled-channels") ||
      p.startsWith("/api/multiplex-channels") ||
      p.startsWith("/api/vod-files") ||
      p.startsWith("/api/keys") ||
      p.startsWith("/api/key-presets") ||
      p.startsWith("/api/viewer-links") ||
      p.startsWith("/api/ingest-info") ||
      p === "/api/apps",
    role: "operator",
  },
];

function requiredRole(pathname: string, method: string): Role {
  for (const rule of RULES) {
    if (rule.test(pathname, method)) return rule.role;
  }
  return "viewer";
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Always let the wizard's own status check through — harmless (just a
  // boolean), and it's what the wizard's final "restart, then check" step
  // polls to detect that a fresh, fully-configured process has come up.
  if (pathname === "/api/setup" && req.method === "GET") {
    return NextResponse.next();
  }

  if (isSetupNeeded()) {
    // Mid-setup: nothing works except the wizard itself, so a half-configured
    // instance (no session secret, no OME connection) can't be stumbled into.
    if (pathname === "/setup" || pathname.startsWith("/api/setup")) {
      return NextResponse.next();
    }
    if (isApi) return NextResponse.json({ error: "setup required" }, { status: 503 });
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  // Setup already complete: lock the wizard out for good — otherwise anyone
  // could revisit /setup and create another admin account or regenerate the
  // live secrets.
  if (pathname === "/setup" || (pathname.startsWith("/api/setup") && req.method !== "GET")) {
    if (isApi) return NextResponse.json({ error: "setup already complete" }, { status: 403 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (!hasRole(session.role, requiredRole(pathname, req.method))) {
    if (isApi) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
