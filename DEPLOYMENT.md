# Deploying LudoSkill to Vercel

We have optimized the application so that it compiles and deploys seamlessly as a **hybrid Vite Frontend + Express Backend** on Vercel.

---

## ⚙️ Vercel Deployment Settings

When importing your project from GitHub to Vercel, make sure to use these configurations:

1. **Framework Preset**: select **`Vite`** (or **`Other`**). Since we have configured custom build scripts, Vite works perfectly.
2. **Root Directory**: `.` (leave as default).
3. **Build Command**: Keep the default (`npm run build`). This automatically executes both the frontend Vite compilation and the backend `esbuild` server optimizer.
4. **Output Directory**: `dist` (default for Vite).
5. **Environment Variables**:
   * No environment variables are strictly required to start up, but if you have a custom domain or custom API keys in the future, you can add them here.

---

## 🛠️ How We Solved the Errors

1. **Removed the "Load Admin Credentials" button** from the login page as requested.
2. **Path Specifier & Module Resolution Fix**: Resolved the Node ESM path issues by switching the Vercel function (`api/index.ts`) to resolve from the optimized, bundle-compiled production file (`dist/server.cjs`), eliminating any TypeScript runtime dependency problems or path specifier crashes on Vercel's serverless containers.
3. **Writable JSON Database**: Configured the server to automatically write the active players and lobby match JSON-db database into the `/tmp` folder whenever running inside Vercel's cloud functions (which and writeable on serverless environments).
