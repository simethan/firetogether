export function getSiteUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (vercelUrl) {
    const normalizedUrl = vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://") ? vercelUrl : `https://${vercelUrl}`;

    return normalizedUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}