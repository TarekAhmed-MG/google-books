import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /* existing config options if any */

    // Add this images block
    images: {
        remotePatterns: [
            {
                protocol: 'https', // Allow only HTTPS
                hostname: 'books.google.com', // Allow images from this domain
                port: '', // Keep empty for default ports (80/443)
                pathname: '/books/content/**', // Allow images specifically from the /books/content/ path
            },
            // You might also need this if some images come from googleusercontent
            {
                protocol: 'https',
                hostname: '*.googleusercontent.com', // Allow subdomains like lh3.googleusercontent.com
                port: '',
                pathname: '**', // Allow any path
            }
        ],
    },
};

export default nextConfig;