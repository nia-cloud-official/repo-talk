import esbuild from "esbuild";

// Load .env manually (avoids needing dotenv as a dep)
try {
  process.loadEnvFile(".env");
} catch {
  console.error(
    "ERROR: .env file not found.\nCopy .env.example to .env and fill in CLERK_PUBLISHABLE_KEY.",
  );
  process.exit(1);
}

const define = {
  "process.env.BACKEND_URL": JSON.stringify(
    process.env.BACKEND_URL || "http://localhost:3000",
  ),
};

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [
    { in: "src/popup.js", out: "popup" },
    { in: "src/sidebar.js", out: "sidebar" },
    { in: "src/background.js", out: "background" },
  ],
  outdir: ".",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  define,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete!");
}
