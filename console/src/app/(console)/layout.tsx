import { redirect } from "next/navigation";
import { LiveSnapshotProvider } from "./_lib/LiveSnapshotProvider";
import { DrawerProvider } from "./_lib/DrawerProvider";
import { CurrentUserProvider } from "./_lib/CurrentUserProvider";
import { MobileNavProvider } from "./_lib/MobileNavProvider";
import { Sidebar } from "./_components/Sidebar";
import { TopBar } from "./_components/TopBar";
import { StreamDrawer } from "./_components/StreamDrawer";
import { getCurrentUser } from "@/auth/currentUser";

// This is a live operator console, not marketing content — every page under
// here reflects request-time OME/session state and must never be frozen at
// build time (when OME_API_BASE_URL/OME_ACCESS_TOKEN aren't even set).
export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // proxy.ts already guarantees a valid session for every path under here —
  // this only fires if the cookie expired between proxy.ts's check and this
  // render, a narrow race, not a normal path.
  if (!user) redirect("/login");

  return (
    <CurrentUserProvider user={user}>
      <LiveSnapshotProvider>
        <DrawerProvider>
          <MobileNavProvider>
            <div className="shell">
              <TopBar />
              <Sidebar />
              <main>{children}</main>
            </div>
            <StreamDrawer />
          </MobileNavProvider>
        </DrawerProvider>
      </LiveSnapshotProvider>
    </CurrentUserProvider>
  );
}
