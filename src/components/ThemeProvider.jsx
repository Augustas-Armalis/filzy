import { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "filzy-theme";
const ThemeContext = createContext(undefined);

function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  // The inline script in index.html already added/removed `.dark` before paint.
  // Read from the DOM so React stays in sync with it (no flash, no mismatch).
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore write errors (e.g. private mode) */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
