import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from 'next/script';
// Import our new provider
import { GoogleBooksProvider } from "./google-books-provider";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Google Books App",
    description: "Search and manage your Google Books library",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
        {/* Wrap everything in the provider */}
        <GoogleBooksProvider>
            {children}
        </GoogleBooksProvider>

        <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
        </body>
        </html>
    );
}