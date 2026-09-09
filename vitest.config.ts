import {defineConfig} from "vitest/config";
import path from 'path'
import tsconfigPaths from "vite-tsconfig-paths";
import react from '@vitejs/plugin-react';

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        coverage: {
            provider: "istanbul",
            reporter: ["text", "html"]
        }
    },
    resolve: {
        alias: {
            "@CParser": path.resolve(__dirname, "./src/lib/CVIS/CParser"),
            "@CMachine": path.resolve(__dirname, "./src/lib/CVIS/CMachine"),
            "@CVIS": path.resolve(__dirname, "./src/lib/CVIS"),
            "@lib": path.resolve(__dirname, "./src/lib"),
        },
    },
    plugins: [
        react(),
        tsconfigPaths()
    ]
});
