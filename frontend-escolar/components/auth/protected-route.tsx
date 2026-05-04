"use client";

import { useAuth } from "@/context/auth-context";
import type { UserRole } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Props = {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
};

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);
  const accessDenied = Boolean(
    !isLoading && user && allowedRoles && !allowedRoles.includes(user.role),
  );

  useEffect(() => {
    if (isLoading) return;
    if (hasRedirected.current) return;

    if (!user) {
      hasRedirected.current = true;
      router.push("/login");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      const timeout = window.setTimeout(() => {
        hasRedirected.current = true;
        router.push(user.role === "SUPERUSUARIO" ? "/superusuario" : "/dashboard");
      }, 1500);

      return () => window.clearTimeout(timeout);
    }
  }, [user, isLoading, allowedRoles, router]);

  if (isLoading) return null;

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-red-600">Acesso negado</p>
          <p className="mt-2 text-sm text-slate-500">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
