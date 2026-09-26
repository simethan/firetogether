import type { NextConfig } from "next";

/** Set to the old SmartSplit hostname once its DNS points at this deployment. */
const legacySmartSplitHost = process.env.SMARTSPLIT_LEGACY_HOST?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/manifest.json",
      headers: [
        {
          key: "Content-Type",
          value: "application/manifest+json",
        },
      ],
    },
  ],
  redirects: async () => {
    const onLegacyHost = legacySmartSplitHost ? [{ type: "host" as const, value: legacySmartSplitHost }] : null;
    return [
      ...(onLegacyHost
        ? [
            { source: "/group/:code", has: onLegacyHost, destination: `${siteUrl}/groups/:code`, permanent: true },
            { source: "/group/:code/join", has: onLegacyHost, destination: `${siteUrl}/groups/:code/join`, permanent: true },
            { source: "/:path*", has: onLegacyHost, destination: `${siteUrl}/groups`, permanent: true },
          ]
        : []),
      // SmartSplit's share links were /group/CODE.
      { source: "/group/:code", destination: "/groups/:code", permanent: true },
      { source: "/group/:code/join", destination: "/groups/:code/join", permanent: true },
    ];
  },
};

export default nextConfig;
