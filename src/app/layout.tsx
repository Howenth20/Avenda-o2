import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AVENDAÑO RINDE+",
  description: "Control de gastos, asistencia y viáticos por obra.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
