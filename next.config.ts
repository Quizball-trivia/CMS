import type { NextConfig } from "next";
import { resolveTdConfig } from "./src/lib/td/env";

// Fails the build on a bad Table Derby configuration (e.g. the mock API in
// production). Inert when NEXT_PUBLIC_CMS_WORKSPACE is unset or "quizball".
resolveTdConfig(process.env);

const nextConfig: NextConfig = {
  env: {
    // Always defined, so `=== '1'` checks fold at build time and a non-mock
    // build ships none of the mock API code.
    NEXT_PUBLIC_TD_API_MOCK: process.env.NEXT_PUBLIC_TD_API_MOCK ?? '',
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', port: '', pathname: '/storage/v1/object/public/**' }],
  },
};

export default nextConfig;
