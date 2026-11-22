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
