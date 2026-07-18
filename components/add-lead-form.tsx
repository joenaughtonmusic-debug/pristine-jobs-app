"use client"

import { useState, useTransition } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createManualLead } from "@/app/(app)/sales-pipeline/actions"
import { MANUAL_LEAD_SOURCES } from "@/lib/sales-lead-manual"
import { JOB_TYPE_OPTIONS } from "@/lib/sales-leads"

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  suburb: "",
  service_needed: "",
  job_type: "",
  source: "web",
  message: "",
}

// Slice 2.5: manual lead entry. Compact form above the board; collapsed
// behind an "Add lead" button so the page leads with live leads. Creates a
// sales_leads row at status "new" (Stage 1) via the createManualLead server
// action — notes are pasted verbatim, no field extraction yet.
export function AddLeadForm() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const setField =
    (field: keyof typeof EMPTY_FORM) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
    }

  const close = () => {
    setOpen(false)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!form.name.trim()) {
      setError("Name is required.")
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const result = await createManualLead(form)

        if ("error" in result) {
          setError(result.error)
          return
        }

        close()
      } catch {
        setError("Failed to save the lead. Please try again.")
      }
    })
  }

  if (!open) {
    return (
      <div className="mb-6">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add lead
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-lg border bg-white p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-gray-900">New lead</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          placeholder="Name (required)"
          value={form.name}
          onChange={setField("name")}
        />
        <select
          value={form.source}
          onChange={setField("source")}
          aria-label="Source"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {MANUAL_LEAD_SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Input
          placeholder="Phone"
          value={form.phone}
          onChange={setField("phone")}
        />
        <Input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={setField("email")}
        />
        <Input
          placeholder="Suburb"
          value={form.suburb}
          onChange={setField("suburb")}
        />
        <Input
          placeholder="Service needed"
          value={form.service_needed}
          onChange={setField("service_needed")}
        />
        <select
          value={form.job_type}
          onChange={setField("job_type")}
          aria-label="Job type"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Job type (optional)</option>
          {JOB_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        className="mt-3 min-h-[140px]"
        placeholder="Notes — paste the enquiry, text or email here"
        value={form.message}
        onChange={setField("message")}
      />

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save lead"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={close}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
