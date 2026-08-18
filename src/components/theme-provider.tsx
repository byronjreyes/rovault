import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type FontFamily = "bricolage" | "gotham" | "poppins" | "montserrat" | "jakarta";
export type FontSize = "sm" | "md" | "lg" | "xl";

const FONT_FAMILIES: Record<FontFamily, string> = {
  bricolage: '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  gotham: '"Montserrat", "Gotham", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  poppins: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  montserrat: '"Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  jakarta: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const FONT_SIZES: Record<FontSize, string> = {
  sm: "13px",
  md: "14px",
  lg: "16px",
  xl: "18px",
};

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "dark" | "light";
  fontFamily: FontFamily;
  setFontFamily: (f: FontFamily) => void;
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "system",
  setTheme: () => {},
  resolved: "light",
  fontFamily: "bricolage",
  setFontFamily: () => {},
  fontSize: "md",
  setFontSize: () => {},
});

const THEME_KEY = "rovault-theme";
const FONT_FAMILY_KEY = "rovault-font-family";
const FONT_SIZE_KEY = "rovault-font-size";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme) || "system"
  );
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(
    () => (localStorage.getItem(FONT_FAMILY_KEY) as FontFamily) || "bricolage"
  );
  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (localStorage.getItem(FONT_SIZE_KEY) as FontSize) || "md"
  );
  const [resolved, setResolved] = useState<"dark" | "light">("light");

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && mql.matches);
      root.classList.toggle("dark", isDark);
      setResolved(isDark ? "dark" : "light");
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  // Apply font family directly to CSS variables and document body
  useEffect(() => {
    const fontStr = FONT_FAMILIES[fontFamily] || FONT_FAMILIES.bricolage;
    document.documentElement.style.setProperty("--font-sans", fontStr);
    document.documentElement.style.fontFamily = fontStr;
    if (document.body) {
      document.body.style.fontFamily = fontStr;
    }
  }, [fontFamily]);

  // Apply font size
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZES[fontSize] || "14px";
  }, [fontSize]);

  const setTheme = (t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  };

  const setFontFamily = (f: FontFamily) => {
    localStorage.setItem(FONT_FAMILY_KEY, f);
    setFontFamilyState(f);
  };

  const setFontSize = (s: FontSize) => {
    localStorage.setItem(FONT_SIZE_KEY, s);
    setFontSizeState(s);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolved,
        fontFamily,
        setFontFamily,
        fontSize,
        setFontSize,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

