"use client"

import { useState } from "react"
import { createAndSendInvoice } from "@/app/(app)/admin/actions/invoice-actions"

// One-click "Create & send invoice" for a completed quoted job. Calls the
// server action (which POSTs to Make → Xero), then shows the result. A simple
// confirm() is the last human check before a real invoice goes to a customer.
export function CreateInvoiceButton({
  jobId,
  customerLabel,
}: {
  jobId: string
  customerLabel?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleClick = async () => {
    const who = customerLabel ? ` to ${customerLabel}` : ""
    if (
      !window.confirm(
        `Create the Xero invoice and email it${who} now? This sends a real invoice to the customer.`,
      )
    ) {
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await createAndSendInvoice(jobId)
    setBusy(false)
    if (result.ok) {
      setDone(true)
      setMessage(result.message)
    } else {
      setMessage(result.error)
    }
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-green-700">
        {message || "Invoice sent."}
      </p>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {busy ? "Sending invoice…" : "Create & send invoice"}
      </button>
      {message && !done && (
        <p className="max-w-sm text-right text-sm text-red-600">{message}</p>
      )}
    </div>
  )
}
