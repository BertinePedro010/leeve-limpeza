import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  // The repo root (one level up) has an unrelated leftover Vite project with
  // its own package-lock.json, which makes Next.js guess the wrong workspace
  // root for its file tracing (warns "detected additional lockfiles").
  // Pinning it to this app's own directory keeps tracing deterministic both
  // locally and on Vercel, regardless of that sibling project's presence.
  outputFileTracingRoot: path.join(__dirname),
  // pdfkit (lib/pdf.ts) loads its standard-font metrics (data/*.afm) from disk
  // at runtime via a path relative to its own module folder, and its
  // package.json "exports" map resolves `require("pdfkit")` to a CJS entry
  // (js/pdfkit.js) that is separate from the ESM entry Next's file tracer
  // was only picking up on its own. Two failure modes, both confirmed by
  // inspecting the built output:
  //  1. Left bundled by webpack (the default for any imported package), its
  //     __dirname-relative reads break because __dirname then resolves
  //     inside the webpack chunk, not pdfkit's real folder - this is what
  //     broke "Baixar PDF" in the deployed build even though it worked in
  //     local dev/tests (no bundling step there).
  //  2. Even kept external (below), Next's automatic file tracing alone
  //     only copied pdfkit's ESM entry (pdfkit.node.mjs) into the traced
  //     output, not the CJS entry/data files Node's `require()` actually
  //     resolves to - reproduced locally as a clean `MODULE_NOT_FOUND` for
  //     node_modules/pdfkit/js/pdfkit.js after building with `output:
  //     standalone`. outputFileTracingIncludes below forces the whole
  //     package (js/pdfkit.js + js/data/*.afm included) into the trace for
  //     every route that can generate a PDF, closing that gap for good.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/orders/**/*": ["./node_modules/pdfkit/**/*"],
  },
};

export default nextConfig;
