import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    outputFileTracingRoot: dirname(import.meta.dirname),
    typescript: { tsconfigPath: 'tsconfig.build.json' },
    reactStrictMode: false,

    // Experimental features for faster builds
    experimental: {
        // Enable SWC minification optimizations
        optimizePackageImports: [
            'marked',
            'highlight.js',
            'react',
            'react-dom',
        ],
    },

    redirects() {
        // The short (1min) and detailed (5min) CVs were merged into one page at /cv.
        return Promise.resolve([
            {
                source: '/cv/5min',
                destination: '/cv',
                permanent: true,
            },
            {
                source: '/cv/1min',
                destination: '/cv',
                permanent: true,
            },
        ]);
    },

    rewrites() {
        return Promise.resolve([
            {
                source: '/wedding',
                destination: '/wedding/index.html',
            },
        ]);
    },
};

export default nextConfig;
