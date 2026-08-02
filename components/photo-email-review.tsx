"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  sendPhotoEmailAction,
  setPhotoHiddenAction,
  skipPhotoEmailAction,
} from "@/app/(app)/admin/actions/photo-email-actions"
import {
  HIDE_CRITERIA_TEXT,
  PHOTO_PAGE_BASE,
  SKIP_REASONS,
  buildPhotoEmail,
  formatNzDate,
  type PhotoEmailCard,
} from "@/lib/photo-email"

// The VA's daily photo-email review pile (brief section 3-5): cards grouped
// by visit date, a collapsed Expired list, and a review modal that previews
// exactly what the customer receives. One visit at a time — no bulk send.
export function PhotoEmailReview({ cards }: { cards: PhotoEmailCard[] }) {
  const router = useRouter()
  const [openCard, setOpenCard] = useState<PhotoEmailCard | null>(null)
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [enlarged, setEnlarged] = useState<string | null>(null)
  const [skipMode, setSkipMode] = useState(false)
  const [skipReason, setSkipReason] = useState("")
  const [skipNote, setSkipNote] = useState("")
  const [expiredOpen, setExpiredOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const pile = cards.filter((c) => !c.expired)
  const expired = cards.filter((c) => c.expired)

  const groups = useMemo(() => {
    const byDate = new Map<string, PhotoEmailCard[]>()
    for (const card of pile) {
      byDate.set(card.visitDate, [...(byDate.get(card.visitDate) || []), card])
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [pile])

  const openModal = (card: PhotoEmailCard) => {
    setOpenCard(card)
    setHidden(Object.fromEntries(card.photos.map((p) => [p.id, p.hidden])))
    setSkipMode(false)
    setSkipReason("")
    setSkipNote("")
    setError(null)
    setNotice(null)
  }

  const closeModal = () => {
    setOpenCard(null)
    setEnlarged(null)
    router.refresh() // hides saved immediately — reflect them in the pile counts
  }

  const visibleCount = openCard
    ? openCard.photos.filter((p) => !hidden[p.id]).length
    : 0

  const toggleHidden = (photoId: string) => {
    if (!openCard) return
    const next = !hidden[photoId]
    setHidden((prev) => ({ ...prev, [photoId]: next })) // optimistic; saves immediately
    startTransition(async () => {
      const result = await setPhotoHiddenAction(photoId, next)
      if ("error" in result) {
        setHidden((prev) => ({ ...prev, [photoId]: !next }))
        setError(result.error)
      }
    })
  }

  const handleSend = () => {
    if (!openCard) return
    setError(null)
    startTransition(async () => {
      const result = await sendPhotoEmailAction(openCard.visitId)
      if ("error" in result) {
        setError(result.error)
        return
      }
      if (result.warning) {
        setNotice(result.warning)
        return // leave the modal open so the warning is actually read
      }
      closeModal()
    })
  }

  const handleSkip = () => {
    if (!openCard || !skipReason) return
    setError(null)
    startTransition(async () => {
      const result = await skipPhotoEmailAction(openCard.visitId, skipReason, skipNote)
      if ("error" in result) {
        setError(result.error)
        return
      }
      closeModal()
    })
  }

  const email = openCard
    ? buildPhotoEmail({
        recipientName: openCard.isPmManaged ? openCard.pmName : openCard.clientName,
        address: openCard.address,
        visitDate: formatNzDate(openCard.visitDate),
        publicToken: openCard.publicToken,
      })
    : null

  if (cards.length === 0) return null

  const CardRow = ({ card }: { card: PhotoEmailCard }) => (
    <button
      type="button"
      onClick={() => openModal(card)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-3 text-left hover:border-green-600"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{card.address}</p>
        <p className="text-xs text-gray-500">
          {formatNzDate(card.visitDate)} · {card.photoCount} photo
          {card.photoCount === 1 ? "" : "s"}
        </p>
        {card.recipientError && (
          <p className="mt-1 text-xs font-medium text-red-600">
            {card.recipientError}
          </p>
        )}
      </div>
      {card.isPmManaged && (
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
            card.ageDays >= 1
              ? "bg-red-100 text-red-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          PM · {card.ageDays} day{card.ageDays === 1 ? "" : "s"}
        </span>
      )}
    </button>
  )

  return (
    <section className="mx-auto mb-6 max-w-5xl px-4 pt-6">
      <div className="rounded-xl border bg-muted/20 p-4">
        <h2 className="text-lg font-semibold">Photo emails to review</h2>
        <p className="text-sm text-gray-500">
          Check the photos, hide any that shouldn&apos;t go out, then send the
          customer their photo-page link. PM properties within 24 hours.
        </p>

        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Nothing waiting today.</p>
        ) : (
          groups.map(([date, dateCards]) => (
            <div key={date} className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                {formatNzDate(date)} · {dateCards.length}
              </h3>
              <div className="grid gap-2">
                {dateCards.map((card) => (
                  <CardRow key={card.visitId} card={card} />
                ))}
              </div>
            </div>
          ))
        )}

        {expired.length > 0 && (
          <div className="mt-5 border-t pt-3">
            <button
              type="button"
              className="text-sm font-medium text-gray-600"
              onClick={() => setExpiredOpen(!expiredOpen)}
            >
              Expired — older than 7 days ({expired.length}){" "}
              {expiredOpen ? "▾" : "▸"}
            </button>
            {expiredOpen && (
              <div className="mt-2 grid gap-2">
                {expired.map((card) => (
                  <CardRow key={card.visitId} card={card} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {openCard && email && (
        <Dialog open onOpenChange={(open) => !open && closeModal()}>
          <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Photo email — {openCard.address}</DialogTitle>
            </DialogHeader>

            {/* The operating standard: always visible, never a tooltip. */}
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              {HIDE_CRITERIA_TEXT}
            </p>

            <div className="rounded-md border p-3 text-sm">
              <p>
                <span className="font-medium">To:</span>{" "}
                {openCard.recipientEmail || (
                  <span className="font-medium text-red-600">
                    {openCard.recipientError}
                  </span>
                )}
              </p>
              <p className="mt-1">
                <span className="font-medium">Subject:</span> {email.subject}
              </p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-gray-700">
                {email.body}
              </pre>
              {openCard.isPmManaged && (
                <p className="mt-2 text-xs text-gray-500">
                  A copy goes to Joe (PM property).
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">
                What&apos;s on the photo page —{" "}
                <span
                  className={visibleCount === 0 ? "text-red-600" : "text-green-700"}
                >
                  {visibleCount} photo{visibleCount === 1 ? "" : "s"} will be shown
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {openCard.photos.map((photo) => {
                  const isHidden = Boolean(hidden[photo.id])
                  return (
                    <div key={photo.id} className="relative">
                      <button
                        type="button"
                        className="block w-full overflow-hidden rounded-lg border"
                        onClick={() => setEnlarged(photo.public_url)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.public_url}
                          alt="Visit photo"
                          className={`aspect-square w-full object-cover ${
                            isHidden ? "opacity-30 grayscale" : ""
                          }`}
                        />
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant={isHidden ? "default" : "secondary"}
                        className="absolute bottom-2 right-2"
                        disabled={pending}
                        onClick={() => toggleHidden(photo.id)}
                      >
                        {isHidden ? "Unhide" : "Hide"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && (
              <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                {notice}
              </p>
            )}

            {!skipMode ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSkipMode(true)}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  disabled={
                    pending || visibleCount === 0 || !openCard.recipientEmail
                  }
                  onClick={handleSend}
                >
                  {pending ? "Sending…" : "Send"}
                </Button>
              </div>
            ) : (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Why skip this one?</p>
                <select
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                >
                  <option value="">Pick a reason…</option>
                  {SKIP_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder="Optional note (required for 'Other')"
                  value={skipNote}
                  onChange={(e) => setSkipNote(e.target.value)}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSkipMode(false)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    disabled={pending || !skipReason}
                    onClick={handleSkip}
                  >
                    Confirm skip
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {enlarged && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEnlarged(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlarged}
            alt="Enlarged visit photo"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </section>
  )
}
