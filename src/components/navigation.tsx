"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", symbol: "◫" },
  { href: "/videos", label: "Videos", symbol: "▷" },
  { href: "/analytics", label: "Analytics", symbol: "▥" },
  { href: "/insights", label: "Insights", symbol: "✧" },
  { href: "/prompts", label: "Prompts", symbol: "⌘" },
  { href: "/experiments", label: "Experiments", symbol: "◇" },
  { href: "/scripts", label: "Scripts", symbol: "✎" },
  { href: "/settings", label: "Settings", symbol: "⚙" },
];
export function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation" className="navigation">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={path === link.href ? "page" : undefined}
        >
          <span aria-hidden="true" className="nav-symbol">
            {link.symbol}
          </span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
