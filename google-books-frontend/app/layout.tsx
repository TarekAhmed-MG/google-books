import type { Metadata } from "next";
// Keep the user's original font import
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// Import the Next.js Script component
import Script from 'next/script';

// Keep the user's original font instances
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// Keep the user's original metadata or update as needed
export const metadata: Metadata = {
    title: "Google Books App", // Keep updated title
    description: "Search and manage your Google Books library", // Keep updated description
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // Keep the user's original html tag setup
        <html lang="en">
        {/* Keep the user's original body tag setup with font variables */}
        <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
        {children}
        {/* Add the Google Identity Services Script */}
        <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
        </body>
        </html>
    );
}