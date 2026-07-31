"use client"

import { useState } from "react"

// Photo grid for the public visit page. Receives bare URLs only — captions
// and metadata are deliberately never passed to the browser.
export function VisitPhotoGrid({ photoUrls }: { photoUrls: string[] }) {
  const [enlarged, setEnlarged] = useState<string | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photoUrls.map((url, index) => (
          <button
            key={url}
            type="button"
            className="block overflow-hidden rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-600"
            onClick={() => setEnlarged(url)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Visit photo ${index + 1}`}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
          </button>
        ))}
      </div>

      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEnlarged(null)}
          role="dialog"
          aria-label="Enlarged photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlarged}
            alt="Enlarged visit photo"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-900"
            onClick={() => setEnlarged(null)}
          >
            Close
          </button>
        </div>
      )}
    </>
  )
}
