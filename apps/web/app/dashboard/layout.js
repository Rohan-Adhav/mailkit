"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { isLoggedIn, clearToken } from "../../lib/api";

const links = [
  { href: "/dashboard/contacts", label: "Contacts" },
  { href: "/dashboard/audiences", label: "Audiences" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login");
  }, [router]);

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="brand">MailKit</div>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? "active" : ""}>
            {l.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            clearToken();
            router.replace("/login");
          }}
        >
          Log out
        </a>
      </div>
      <div className="main">{children}</div>
    </div>
  );
}
