import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Trophy } from "lucide-react";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { AppNav } from "@/components/AppNav";
import { TopLoadingBar } from "@/components/TopLoadingBar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { NotificationBell } from "@/components/NotificationBell";

export const metadata: Metadata = {
  title: "Previa",
  description: "Plataforma de quinielas por salas y competiciones",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const theme = localStorage.getItem('theme') || 'system';
              if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (e) {}
          })()
        `}} />
      </head>
      <body>
        <Suspense fallback={null}>
          <TopLoadingBar />
        </Suspense>
        <div className="app-shell">
          {user ? (
            <>
              <header className="mobile-header">
                <Link className="brand-mobile" href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <img src="/logo-previa-shield.png" alt="Previa Logo Shield" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
                  <span>Previa</span>
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <NotificationBell />
                  <ThemeSwitcher />
                  <form action={logoutAction}>
                    <button className="mobile-logout-button" type="submit">
                      Salir
                    </button>
                  </form>
                </div>
              </header>

              <aside className="sidebar">
                <Link className="brand" href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", marginBottom: "28px" }}>
                  <span className="brand-mark" style={{ border: "none", background: "transparent", padding: 0, width: "36px", height: "36px", flexShrink: 0 }}>
                    <img src="/logo-previa-shield.png" alt="Previa Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </span>
                  <span>
                    <strong style={{ fontSize: "1.25rem", color: "var(--ink)", fontWeight: 850 }}>Previa</strong>
                    <small style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Salas y torneos</small>
                  </span>
                </Link>
                <AppNav role={user.role} />
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="sidebar-utility-row" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <NotificationBell />
                    <ThemeSwitcher />
                  </div>
                  <form action={logoutAction} className="sidebar-footer" style={{ marginTop: 0 }}>
                    <span>{user.displayName}</span>
                    <button className="ghost-button" type="submit">
                      Salir
                    </button>
                  </form>
                </div>
              </aside>
              <div className="mobile-only-theme-switcher">
                <ThemeSwitcher />
              </div>
            </>
          ) : null}
          <main className={user ? "content" : "auth-content"}>{children}</main>
        </div>
      </body>
    </html>
  );
}
