import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "export", // keep this for static export
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "books.google.com",
                pathname: "/books/content/**", // ✅ matches /books/content?id=...
            },
            {
                protocol: "https",
                hostname: "*.googleusercontent.com", // ✅ covers lh3.googleusercontent.com etc.
                pathname: "**",
            },
        ],
        unoptimized: true, // ✅ required for `output: "export"`
    },
};

export default nextConfig;
