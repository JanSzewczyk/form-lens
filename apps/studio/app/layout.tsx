import { Toaster } from "@szum-tech/design-system";
import type { Metadata } from "next";
import { JetBrains_Mono, Poppins } from "next/font/google";

import { ThemeProvider } from "~/components/providers/theme-provider";

import "./globals.css";

/** The variable names are the ones the design system reads (`font-poppins`, `font-code`). */
const poppins = Poppins({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"]
});

const jetBrainsMono = JetBrains_Mono({
  display: "swap",
  subsets: ["latin", "latin-ext"],
  variable: "--font-code",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  description: "FormLens Studio: work with form templates and extractions from the FormLens API.",
  title: { default: "FormLens Studio", template: "%s | FormLens Studio" }
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${poppins.variable} ${jetBrainsMono.variable}`} lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
