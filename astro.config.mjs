import { defineConfig } from 'astro/config';

export default defineConfig({
  // the live address, for absolute link-preview urls (og:image, canonical)
  site: 'https://gruffarchive.art',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
