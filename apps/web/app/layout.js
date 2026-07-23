import "./globals.css";

export const metadata = {
  title: "MailKit",
  description: "A small email marketing tool: contacts, audiences, campaigns.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
