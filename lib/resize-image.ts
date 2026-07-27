// Client-side image resize, run at file SELECTION (before the file reaches
// storage). Shrinks phone photos so customer-facing invoice attachments are
// light, normalises HEIC -> JPEG at source (on browsers that can decode HEIC,
// i.e. iOS Safari, where HEIC originates), and speeds up crew uploads.
//
// Best-effort by contract: ANY failure returns the ORIGINAL file unchanged. A
// resize error must never block an upload — the rental photo-gate depends on a
// photo always going through.
//
// Forward-only — existing photos are never touched.

const MAX_LONG_EDGE = 1600
const JPEG_QUALITY = 0.8

function withJpgName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "")
  return `${base || "photo"}.jpg`
}

// Draw the bitmap onto a canvas scaled to the long-edge cap and export JPEG.
async function encodeResized(bitmapSource: CanvasImageSource, width: number, height: number, name: string): Promise<File | null> {
  const longEdge = Math.max(width, height)
  const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1
  const targetW = Math.max(1, Math.round(width * scale))
  const targetH = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bitmapSource, 0, 0, targetW, targetH)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  )
  if (!blob || blob.size === 0) return null
  return new File([blob], withJpgName(name), { type: "image/jpeg" })
}

export async function resizeImageFile(file: File): Promise<File> {
  // Non-images pass through untouched.
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) {
    return file
  }

  try {
    // createImageBitmap decodes most formats the browser supports (incl. HEIC on
    // iOS Safari) without an <img> load dance.
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file)
      const out = await encodeResized(bitmap, bitmap.width, bitmap.height, file.name)
      bitmap.close?.()
      if (out) return out
    }

    // Fallback: decode via an <img> element + object URL.
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error("image decode failed"))
        el.src = url
      })
      const out = await encodeResized(img, img.naturalWidth, img.naturalHeight, file.name)
      if (out) return out
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    // fall through to original
  }

  // Best-effort: never block the upload.
  return file
}

// Resize a list, preserving order, each best-effort.
export async function resizeImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => resizeImageFile(f)))
}
