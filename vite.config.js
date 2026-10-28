import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything (JS, CSS, CSV data) is inlined into dist/index.html.
export default defineConfig({
  plugins: [viteSingleFile()],
});
