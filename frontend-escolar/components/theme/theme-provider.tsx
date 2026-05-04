"use client";

import { useEffect } from "react";

const THEME_STORAGE_KEY = "gestclass_theme";

type StoredTheme = {
  mode?: "light" | "dark";
  primary?: string;
  secondary?: string;
};

export function applyGestClassTheme(theme: StoredTheme) {
  const root = document.documentElement;

  root.dataset.themeMode = theme.mode || "light";
  root.style.setProperty("--primary", theme.primary || "#2563eb");
  root.style.setProperty("--secondary", theme.secondary || "#7c3aed");
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      applyGestClassTheme(stored ? JSON.parse(stored) : {});
    } catch {
      applyGestClassTheme({});
    }
  }, []);

  return children;
}

export { THEME_STORAGE_KEY };
