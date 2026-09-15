"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logout } from "../../(auth)/login/actions";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { useMobileNav } from "../_lib/MobileNavProvider";
import { formatBitrate } from "../_lib/format";

function useClock(): string {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => setNow(new Date().toTimeString().slice(0, 8));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const clock = useClock();
  const snapshot = useLiveSnapshot();
  const server = snapshot?.server;
  const { toggle } = useMobileNav();

  return (
    <header className="top">
      <button className="hamburger" aria-label="Toggle navigation" onClick={toggle}>
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="brand">
        Oven Console <small>{server?.version ? `OvenMediaEngine ${server.version}` : "OvenMediaEngine"}</small>
      </div>
      <div className="spacer" />
      <div className="health">
        <span>
          <span
            className={`dot${!snapshot ? " warn" : !server?.apiOk ? " bad" : server.streamsStale ? " warn" : ""}`}
          />
          API{" "}
          <b>
            {!snapshot ? "connecting…" : !server?.apiOk ? "unreachable" : server.streamsStale ? "ok, data stale" : "ok"}
          </b>
        </span>
        {server?.apiOk && (
          <>
            <span>
              CPU <b className="num">{server.cpuLoadPercent}%</b>
            </span>
            <span>
              In <b className="num">{formatBitrate(server.throughputIn)}</b>
            </span>
            <span>
              Out <b className="num">{formatBitrate(server.throughputOut)}</b>
            </span>
            <span>
              Sessions <b className="num">{server.totalSessions}</b>
            </span>
          </>
        )}
      </div>
      <div className="clock num">{clock}</div>
      <Link className="btn sm" href="/help">
        Help
      </Link>
      <Link className="btn sm" href="/account">
        My account
      </Link>
      <form action={logout}>
        <button className="btn sm" type="submit">
          Sign out
        </button>
      </form>
    </header>
  );
}
