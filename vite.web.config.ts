import { defineConfig } from "vite";

// Vite config for the frontend-only web build (GitHub Pages landing page).
// `root: "web"` makes Vite treat web/ as the project root so the built
// index.html lands at the dist-web root (not dist-web/web/). `base` must match
// the Pages subpath so asset URLs resolve correctly.
export default defineConfig({
  root: "web",
  base: "/VFXPiano/",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
