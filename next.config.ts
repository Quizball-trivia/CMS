import type { NextConfig } from "next";
import { resolveTdConfig, tdContentSecurityPolicy } from "./src/lib/td/env";
import { resolveWorkspace } from "./src/lib/workspace";

// Fails the build on a bad workspace or Table Derby configuration (e.g. the
// mock API with NEXT_PUBLIC_CMS_ENV=PROD). Inert for the Quizball workspace.
const isTableDerby = resolveWorkspace(process.env.NEXT_PUBLIC_CMS_WORKSPACE) === "table-derby";
const tdConfig = resolveTdConfig(process.env);

const nextConfig: NextConfig = {
  env: {
    // Always defined, so literal `===` checks fold at build time: a non-mock
    // build ships no mock API code, and the Quizball route guards compile away.
    NEXT_PUBLIC_CMS_WORKSPACE: process.env.NEXT_PUBLIC_CMS_WORKSPACE ?? '',
    NEXT_PUBLIC_TD_API_MOCK: process.env.NEXT_PUBLIC_TD_API_MOCK ?? '',
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', port: '', pathname: '/storage/v1/object/public/**' }],
  },
  ...(isTableDerby && {
    async headers() {
      return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: tdContentSecurityPolicy(tdConfig) }] }];
    },
  }),
};

export default nextConfig;
