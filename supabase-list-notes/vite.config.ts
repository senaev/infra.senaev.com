import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            injectRegister: "auto",
            includeAssets: ["favicon.ico", "logo.svg", "logo196.png", "robots.txt"],
            manifest: {
                name: "Supabase Notes",
                short_name: "Notes",
                description: "Supabase Notes is a lightweight notes app powered by Supabase.",
                theme_color: "#3ecf8e",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/logo196.png",
                        sizes: "196x196",
                        type: "image/png",
                    },
                ],
            },
        }),
    ],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/setupTests.ts",
    },
});
