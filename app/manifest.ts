import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pristine Jobs",
    short_name: "Pristine Jobs",
    description: "Pristine Gardens Operations App",

    start_url: "/jobs",
    scope: "/",

    display: "standalone",

    background_color: "#ffffff",
    theme_color: "#2d6a4f",

    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}