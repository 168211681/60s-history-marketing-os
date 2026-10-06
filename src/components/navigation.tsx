"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isNavCurrent,
  primaryNavigation,
  workspaceNavigation,
  type NavLink,
} from "@/lib/navigation";

function NavLinks({ links, path }: { links: readonly NavLink[]; path: string }) {
  return (
    <div className="nav-links">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isNavCurrent(path, link.href) ? "page" : undefined}
        >
          <span aria-hidden="true" className="nav-symbol">
            {link.symbol}
          </span>
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function Navigation() {
  const path = usePathname() || "/";
  return (
    <nav aria-label="Main navigation" className="navigation">
      <div className="nav-section">
        <p className="nav-group-label">ClipForge</p>
        <NavLinks links={primaryNavigation} path={path} />
      </div>
      <div className="nav-section">
        <p className="nav-group-label">Working tools</p>
        <NavLinks links={workspaceNavigation} path={path} />
      </div>
    </nav>
  );
}
