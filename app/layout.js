import "./globals.css";

export const metadata = {
  title: "LCPTMS — Lake Charles Pilots Traffic Management System",
  description: "Operational traffic decision-support dashboard for the Calcasieu Ship Channel"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}