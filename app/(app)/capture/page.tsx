"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Mic, Square, X, Loader2 } from "lucide-react"

type Capture = {
  id: string
  type: string
  transcript: string | null
  triage_confidence: string | null
  status: string
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  commercial_lead: "Commercial leads",
  property_followup: "Property follow-ups",
  annoying_task: "Annoying tasks",
  unsorted: "Unsorted",
}
const TYPE_ORDER = ["commercial_lead", "property_followup", "annoying_task", "unsorted"]

// Non-blocking geolocation — resolves to null if denied, slow, or unsupported.
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null)
    const done = (v: { lat: number; lng: number } | null) => resolve(v)
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
    )
  })
}

export default function CapturePage() {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<Capture | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabase = createClient()

  const loadToday = useCallback(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from("captures")
      .select("id, type, transcript, triage_confidence, status, created_at")
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
    setCaptures((data as Capture[]) ?? [])
  }, [supabase])

  useEffect(() => {
    loadToday()
  }, [loadToday])

  const showFlash = (row: Capture) => {
    setFlash(row)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2500)
  }

  const send = useCallback(
    async (body: FormData | string, isJson: boolean) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          ...(isJson
            ? { headers: { "Content-Type": "application/json" }, body }
            : { body }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || "Capture failed")
        }
        const row = (await res.json()) as Capture
        showFlash(row)
        setCaptures((prev) => [row, ...prev])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Capture failed")
      } finally {
        setBusy(false)
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        // Geolocation runs in parallel and never blocks the capture.
        const coords = await getCoords()
        const form = new FormData()
        const ext = (recorder.mimeType.split("/")[1] || "webm").split(";")[0]
        form.append("audio", blob, `note.${ext}`)
        if (coords) {
          form.append("lat", String(coords.lat))
          form.append("lng", String(coords.lng))
        }
        await send(form, false)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setError("Microphone unavailable — check permissions")
    }
  }

  const stopRecording = () => {
    setRecording(false)
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  const toggleRecording = () => {
    if (busy) return
    if (recording) stopRecording()
    else startRecording()
  }

  const submitTyped = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = typed.trim()
    if (!text || busy) return
    const coords = await getCoords()
    setTyped("")
    await send(JSON.stringify({ transcript: text, ...coords }), true)
  }

  const dismiss = async (id: string) => {
    setCaptures((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "dismissed" } : c))
    )
    await supabase.from("captures").update({ status: "dismissed" }).eq("id", id)
  }

  const visible = captures.filter((c) => c.status !== "dismissed")
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    rows: visible.filter((c) => c.type === type),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Capture</h1>

      {/* Record button — toggle style, glanceable for driving. */}
      <button
        type="button"
        onClick={toggleRecording}
        disabled={busy}
        className={`flex h-44 w-full flex-col items-center justify-center gap-3 rounded-3xl text-lg font-semibold text-white transition-colors disabled:opacity-70 ${
          recording ? "bg-red-600 active:bg-red-700" : "bg-emerald-600 active:bg-emerald-700"
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="h-14 w-14 animate-spin" />
            Saving…
          </>
        ) : recording ? (
          <>
            <Square className="h-14 w-14 fill-white" />
            Recording… tap to stop
          </>
        ) : (
          <>
            <Mic className="h-14 w-14" />
            Tap to record
          </>
        )}
      </button>

      {flash && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          <span className="font-medium">{TYPE_LABELS[flash.type] ?? flash.type}</span>
          {flash.triage_confidence === "low" && (
            <span className="ml-1 text-emerald-700 dark:text-emerald-300">(low confidence)</span>
          )}
          <p className="mt-1 line-clamp-3 opacity-80">{flash.transcript}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Typed fallback for when recording isn't practical. */}
      <form onSubmit={submitTyped} className="flex flex-col gap-2">
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type a note…"
          rows={2}
          className="w-full rounded-xl border border-input bg-background p-3 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !typed.trim()}
          className="rounded-xl bg-foreground py-2.5 text-sm font-medium text-background disabled:opacity-50"
        >
          Save note
        </button>
      </form>

      {/* Today's captures, grouped by type — the "folders" view. */}
      <div className="flex flex-col gap-5">
        <h2 className="text-sm font-medium text-muted-foreground">Today</h2>
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing captured yet today.</p>
        )}
        {grouped.map((g) => (
          <div key={g.type} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {TYPE_LABELS[g.type] ?? g.type} ({g.rows.length})
            </h3>
            {g.rows.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-2 rounded-xl border border-border bg-card p-3"
              >
                <p className="flex-1 text-sm">
                  {c.transcript}
                  {c.triage_confidence === "low" && (
                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                      · check
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(c.id)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded-lg p-1 text-muted-foreground active:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
