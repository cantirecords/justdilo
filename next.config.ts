import type { NextConfig } from "next";
import withSerwist from "@serwist/next";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  serverExternalPackages: [],
  outputFileTracingRoot: __dirname,
};

export default withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
})(config);
