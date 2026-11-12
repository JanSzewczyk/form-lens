import type { Metadata } from "next";

import { ThemeProvider } from "~/components/providers/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  description: "FormLens Studio: work with form templates and extractions from the FormLens API.",
  title: "FormLens Studio"
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
