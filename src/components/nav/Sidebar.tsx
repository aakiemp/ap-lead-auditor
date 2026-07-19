"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", isActive: (p) => p === "/" },
  { href: "/leads", label: "Leads", isActive: (p) => p.startsWith("/leads") },
  { href: "/queue", label: "Audit Queue", isActive: (p) => p.startsWith("/queue") },
  { href: "/searches", label: "Searches", isActive: (p) => p.startsWith("/searches") },
];

const QUICK_ACTIONS: NavItem[] = [
  { href: "/leads/new", label: "Add Lead", isActive: () => false },
  { href: "/searches/new", label: "New Search", isActive: () => false },
];

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const active = item.isActive(pathname);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "block rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          : "block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      }
    >
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: persistent left sidebar */}
      <nav
        aria-label="Primary"
        className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white px-3 py-6 md:flex md:flex-col md:gap-6"
      >
        <div className="px-3 text-sm font-semibold tracking-tight text-zinc-900">AP Webmaster</div>
        <div className="space-y-1">
          {PRIMARY_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
        <div className="space-y-1 border-t border-zinc-100 pt-4">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Quick actions</p>
          {QUICK_ACTIONS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* Mobile: compact top bar with a toggled dropdown */}
      <div className="border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-zinc-900">AP Webmaster</span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700"
          >
            {mobileOpen ? "Close" : "Menu"}
          </button>
        </div>
        {mobileOpen ? (
          <nav id="mobile-nav" aria-label="Primary" className="mt-3 space-y-1">
            {PRIMARY_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} />
            ))}
            <div className="space-y-1 border-t border-zinc-100 pt-2">
              {QUICK_ACTIONS.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} />
              ))}
            </div>
          </nav>
        ) : null}
      </div>
    </>
  );
}
