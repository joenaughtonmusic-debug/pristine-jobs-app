/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // @react-pdf/renderer renders server-side (PM issue report); keep it external
  // so Next doesn't try to bundle its Node-only internals.
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
