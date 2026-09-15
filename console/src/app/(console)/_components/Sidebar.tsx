"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "../_lib/CurrentUserProvider";
import { useMobileNav } from "../_lib/MobileNavProvider";
import { hasRole, type Role } from "@/auth/roles";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Minimum role to see this item at all. Omitted = visible to every
  // logged-in role (Viewer and up) — mirrors proxy.ts's own default.
  minRole?: Role;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Mirrors ome-console-mockup.html's nav exactly (groups, order, icons).
// The "addinput" section exists as a route but is reached from the
// Multiviewer's "Add input" button, not from the sidebar — same as the mockup.
const GROUPS: NavGroup[] = [
  {
    label: "Show",
    items: [
      {
        href: "/",
        label: "Multiviewer",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="8" height="7" />
            <rect x="13" y="4" width="8" height="7" />
            <rect x="3" y="13" width="8" height="7" />
            <rect x="13" y="13" width="8" height="7" />
          </svg>
        ),
      },
      {
        href: "/streams",
        label: "Streams",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        ),
      },
      {
        href: "/push",
        label: "Push targets",
        minRole: "operator",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        ),
      },
      {
        href: "/rec",
        label: "Recording",
        minRole: "operator",
        icon: (
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Pipeline",
    items: [
      {
        href: "/profiles",
        label: "Output profiles",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M4 7h16M4 12h10M4 17h6" />
            <circle cx="18" cy="15" r="3" />
          </svg>
        ),
      },
      {
        href: "/channels",
        label: "Channels",
        minRole: "operator",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M4 6h8v12H4zM12 12h8M16 8l4 4-4 4" />
          </svg>
        ),
      },
      {
        href: "/access",
        label: "Publish keys & links",
        minRole: "operator",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Server",
    items: [
      {
        href: "/hosts",
        label: "Hosts & apps",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M4 6h16v5H4zM4 13h16v5H4z" />
          </svg>
        ),
      },
      {
        href: "/stats",
        label: "Statistics & alerts",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />
          </svg>
        ),
      },
      {
        href: "/logs",
        label: "Logs",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
          </svg>
        ),
      },
    ],
  },
  {
    // Identity/governance tools — separated from "Server" (engine
    // health/config) since they're a different concern with a different
    // role profile (all Engineer-only, none of them about the running
    // engine itself). See the UI sweep's findings for why this group exists.
    label: "Admin",
    items: [
      {
        href: "/access-settings",
        label: "Access settings",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4l3 2" />
          </svg>
        ),
      },
      {
        href: "/users",
        label: "Users & roles",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 1 1 0 6M22 20c0-2.8-2-5-5-5.7" />
          </svg>
        ),
      },
      {
        href: "/servers",
        label: "Other servers",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="6" rx="1" />
            <rect x="3" y="14" width="18" height="6" rx="1" />
            <circle cx="7" cy="7" r="0.5" />
            <circle cx="7" cy="17" r="0.5" />
          </svg>
        ),
      },
      {
        href: "/audit",
        label: "Audit log",
        minRole: "engineer",
        icon: (
          <svg viewBox="0 0 24 24">
            <path d="M9 3h6l1 4h4v2h-2l-1.5 12h-9L5 9H3V7h4l1-4z" />
            <path d="M9 11v6M12 11v6M15 11v6" />
          </svg>
        ),
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useCurrentUser();
  const { open, close } = useMobileNav();

  return (
    <>
      {open && <div className="nav-backdrop" onClick={close} />}
      <nav className={open ? "open" : undefined}>
        {GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => hasRole(role, item.minRole ?? "viewer"));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="grp">{group.label}</div>
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "on" : undefined}
                  onClick={close}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </>
  );
}
