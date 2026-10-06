export type NavLink = {
  href: string;
  label: string;
  symbol: string;
};

export const primaryNavigation: readonly NavLink[] = [
  { href: "/", label: "Dashboard", symbol: "◫" },
  { href: "/projects", label: "Projects", symbol: "▣" },
  { href: "/library", label: "Library", symbol: "▤" },
  { href: "/distribution", label: "Distribution", symbol: "↗" },
  { href: "/calendar", label: "Calendar", symbol: "▦" },
  { href: "/analytics", label: "Analytics", symbol: "▥" },
  { href: "/archive", label: "Archive", symbol: "◻" },
  { href: "/settings", label: "Settings", symbol: "⚙" },
];

export const workspaceNavigation: readonly NavLink[] = [
  { href: "/videos", label: "Videos", symbol: "▷" },
  { href: "/insights", label: "Insights", symbol: "✧" },
  { href: "/scripts", label: "Scripts", symbol: "✎" },
  { href: "/research", label: "Research", symbol: "⌕" },
];

export function isNavCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
