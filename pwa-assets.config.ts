import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PWA icons in public/ from public/icon.svg: `npm run icons`.
const background = { resizeOptions: { background: '#1C1916' } };

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, ...background },
    apple: { ...minimal2023Preset.apple, ...background },
  },
  images: ['public/icon.svg'],
});
