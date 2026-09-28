import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Next blocks cross-origin requests to dev-only assets, which silently kills
// the HMR socket when the app is opened over the machine's LAN address instead
// of localhost. Collect the local IPv4 addresses so phone and tablet testing
// gets live reload too. Dev-only; Next ignores this in production builds.
const lanOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface?.family === "IPv4" && !iface.internal)
  .map((iface) => iface!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanOrigins,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            // Never serve a stale worker — otherwise a push handler fix
            // can sit uninstalled on a device indefinitely.
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
  // The front door is the Workbench public page, a static build of the
  // Dispatch-Public-Site project. Running `npm run build:dispatch` there writes
  // it to public/welcome; rebuild and commit after editing that site.
  async rewrites() {
    return [{ source: "/", destination: "/welcome/index.html" }];
  },
};

export default nextConfig;
