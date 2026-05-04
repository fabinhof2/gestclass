"use client";

import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/auth/protected-route";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isSocialImmersive =
    pathname === "/feed/rede-social" || pathname === "/feed/chat";

  return (
    <ProtectedRoute>
      <div
        className={
          isSocialImmersive
            ? "min-h-screen bg-[linear-gradient(180deg,#f7f1e8_0%,#f3ede4_18%,#efe8de_100%)]"
            : "min-h-screen lg:flex"
        }
      >
        {!isSocialImmersive ? <Sidebar /> : null}

        <main className="relative flex-1 overflow-hidden">
          {!isSocialImmersive ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-[rgba(216,141,98,0.08)] blur-3xl" />
              <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-[rgba(142,185,173,0.12)] blur-3xl" />
            </div>
          ) : null}

          <div
            className={
              isSocialImmersive
                ? "relative min-h-screen"
                : "soft-container relative space-y-6 py-6 md:py-8"
            }
          >
            {!isSocialImmersive ? <Header /> : null}
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
