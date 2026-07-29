/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Dev-only: lets phones on the office LAN load the dev server's JS for
  // real-device staging tests (Next blocks non-localhost dev origins by
  // default, which leaves pages un-hydrated — login silently no-ops).
  allowedDevOrigins: ["192.168.1.*"],
  images: {
    unoptimized: true,
  },
  // @react-pdf/renderer renders server-side (PM issue report); keep it external
  // so Next doesn't try to bundle its Node-only internals.
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
