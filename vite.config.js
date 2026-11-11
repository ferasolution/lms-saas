import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.jsx'],
            refresh: true,
            // Fonts are downloaded at build time; SKIP_FONTS=1 builds offline with system fonts.
            fonts: process.env.SKIP_FONTS ? [] : [
                bunny('Bricolage Grotesque', { weights: [500, 700, 800] }),
                bunny('Atkinson Hyperlegible', { weights: [400, 700] }),
            ],
        }),
        react(),
        tailwindcss(),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
