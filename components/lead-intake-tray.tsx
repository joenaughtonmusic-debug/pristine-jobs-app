"use client"

import { useState, useTransition } from "react"
import { ClipboardPaste, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PASTE_INTAKE_SOURCES } from "@/lib/sales-lead-manual"
import { JOB_TYPE_OPTIONS } from "@/lib/sales-leads"
import type { IntakeFlag } from "@/lib/lead-intake-flags"
import {
  createLeadIntake,
  approveLeadIntake,
  dismissLeadIntake,
  restoreLeadIntake,
} from "@/app/(app)/sales-pipeline/lead-intake-actions"

// One pending card's server-computed view: the extracted fields already mapped
// to the confirm-form shape, plus the flags and any extraction error.
export type IntakeCard = {
  id: string
  source: string | null
  createdAt: string
  extractionError: string | null
  flags: IntakeFlag[]
  blocking: boolean
  // pre-filled confirm-form values
  name: string
  phone: string
  email: string
  address: string
  suburb: string
  service_needed: string
  job_type: string
  message: string
  rawSource: string
}

export type DismissedCard = {
  id: string
  source: string | null
  name: string
  createdAt: string
}

const SEVERITY_CLASS: Record<IntakeFlag["severity"], string> = {
  blocking: "bg-red-100 text-red-800 border-red-300",
  warn: "bg-amber-100 text-amber-900 border-amber-300",
  info: "bg-gray-100 text-gray-700 border-gray-300",
  highlight: "bg-sky-100 text-sky-900 border-sky-300",
}

function FlagList({ flags }: { flags: IntakeFlag[] }) {
  if (flags.length === 0) {
    return <p className="text-xs font-medium text-green-700">No flags — ready to approve.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      {flags.map((f) => (
        <span
          key={f.rule}
          className={`inline-block w-fit rounded-md border px-2 py-0.5 text-xs ${SEVERITY_CLASS[f.severity]}`}
        >
          {f.message}
        </span>
      ))}
    </div>
  )
}

export function LeadIntakeTray({
  cards,
  dismissed,
}: {
  cards: IntakeCard[]
  dismissed: DismissedCard[]
}) {
  return (
    <section className="mb-6">
      <PasteBox />
      {cards.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            Pending approval ({cards.length})
          </h2>
          <div className="flex flex-col gap-3">
            {cards.map((card) => (
              <PendingCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      )}
      {dismissed.length > 0 && <DismissedSection dismissed={dismissed} />}
    </section>
  )
}

function PasteBox() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [source, setSource] = useState<string>(PASTE_INTAKE_SOURCES[0].value)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!text.trim()) {
      setError("Paste the enquiry text first.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createLeadIntake({ rawSource: text, source })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setText("")
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-4 w-4" />
        Paste an enquiry
      </Button>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Paste an enquiry</h2>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Source"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {PASTE_INTAKE_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        className="min-h-[140px]"
        placeholder="Paste a Messenger thread or a forwarded Bark email here — the whole thing, raw."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Reading…" : "Extract to tray"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function PendingCard({ card }: { card: IntakeCard }) {
  const [confirming, setConfirming] = useState(false)
  const [form, setForm] = useState({
    name: card.name,
    phone: card.phone,
    email: card.email,
    address: card.address,
    suburb: card.suburb,
    service_needed: card.service_needed,
    job_type: card.job_type,
    message: card.message,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const approve = () => {
    if (!form.name.trim()) {
      setError("Customer name is required to approve. Fill it in or dismiss.")
      return
    }
    if (card.blocking) {
      setError("This lead has no phone or email — add one before approving.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await approveLeadIntake({
        intakeId: card.id,
        lead: { ...form, source: card.source || "other" },
      })
      if ("error" in result) setError(result.error)
    })
  }

  const dismiss = () => {
    setError(null)
    startTransition(async () => {
      const result = await dismissLeadIntake(card.id)
      if ("error" in result) setError(result.error)
    })
  }

  const blank = (v: string) => (v.trim() ? v : "—")

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
            {card.source || "other"}
          </span>
        </div>
        <span className="shrink-0 text-xs text-gray-400">{card.createdAt}</span>
      </div>

      {card.extractionError && (
        <p className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900">
          Couldn&apos;t read this automatically — nothing was invented. Fill the fields in by hand
          from the pasted text below.
        </p>
      )}

      {!confirming ? (
        <>
          <div className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div><span className="text-gray-500">Name:</span> {blank(card.name)}</div>
            <div><span className="text-gray-500">Phone:</span> {blank(card.phone)}</div>
            <div><span className="text-gray-500">Email:</span> {blank(card.email)}</div>
            <div><span className="text-gray-500">Address:</span> {blank(card.address)}</div>
            <div className="sm:col-span-2"><span className="text-gray-500">Service:</span> {blank(card.service_needed)}</div>
          </div>
          <div className="mt-3">
            <FlagList flags={card.flags} />
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setConfirming(true)}>
              Review &amp; approve
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={dismiss}>
              Dismiss
            </Button>
            <details className="ml-auto">
              <summary className="cursor-pointer text-xs text-gray-500">View pasted text</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">
                {card.rawSource}
              </pre>
            </details>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-gray-500">
            Confirm the details — this becomes a new lead on the board. Everything is editable.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Name (required)" value={form.name} onChange={set("name")} />
            <Input placeholder="Phone" value={form.phone} onChange={set("phone")} />
            <Input placeholder="Email" value={form.email} onChange={set("email")} />
            <Input placeholder="Address" value={form.address} onChange={set("address")} />
            <Input placeholder="Suburb" value={form.suburb} onChange={set("suburb")} />
            <Input placeholder="Service needed" value={form.service_needed} onChange={set("service_needed")} />
            <select
              value={form.job_type}
              onChange={set("job_type")}
              aria-label="Job type"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Job type (optional)</option>
              {JOB_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Textarea className="mt-2 min-h-[100px]" placeholder="Notes" value={form.message} onChange={set("message")} />
          <div className="mt-3">
            <FlagList flags={card.flags} />
          </div>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={approve}>
              {pending ? "Approving…" : "Approve → add to board"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DismissedSection({ dismissed }: { dismissed: DismissedCard[] }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="mt-4">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-gray-500"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Dismissed ({dismissed.length}) — kept 30 days
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {dismissed.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border bg-gray-50 p-2 text-sm">
              <span className="truncate">
                <span className="capitalize text-gray-500">{d.source || "other"}</span>
                {" · "}
                {d.name.trim() || "Unnamed"}
                <span className="ml-2 text-xs text-gray-400">{d.createdAt}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(async () => { await restoreLeadIntake(d.id) })}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
