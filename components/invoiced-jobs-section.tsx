"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  clearPaidInvoicesAction,
  setInvoicePaidAction,
} from "@/app/(app)/sales-pipeline/actions"

// Slice 5 (Phase1 spec §5): finished, invoiced work sits below the board so
// live leads stay front and centre. Rows come from scheduled_jobs where Make
// has written back a Xero invoice number. No lead linkage yet — leads aren't
// joined to jobs until Phase 2 — so rows show the property's client/suburb.
export type InvoicedJob = {
  id: string
  xero_invoice_number: string | null
  quoted_amount: number | string | null
  invoice_paid_in_app_at: string | null
  properties: {
    client_name: string | null
    suburb: string | null
  } | null
}

const nzd = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
})

function formatAmount(value: InvoicedJob["quoted_amount"]) {
  const amount = Number(value)
  return value === null || Number.isNaN(amount) ? "—" : nzd.format(amount)
}

export function InvoicedJobsSection({ jobs = [] }: { jobs: InvoicedJob[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const paidCount = jobs.filter((job) => job.invoice_paid_in_app_at).length

  const run = (action: () => Promise<{ ok: true } | { error: string }>) => {
    setError(null)

    startTransition(async () => {
      try {
        const result = await action()
        if ("error" in result) setError(result.error)
      } catch {
        setError("Something went wrong. Please try again.")
      }
    })
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Invoiced jobs</h2>
          <p className="text-sm text-gray-500">
            Paid is app-only tracking — Xero is reconciled separately.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || paidCount === 0}
          title={
            paidCount === 0
              ? "Tick invoices as paid first"
              : "Archive the paid rows off this page"
          }
          onClick={() => run(() => clearPaidInvoicesAction())}
        >
          Clear paid{paidCount > 0 ? ` (${paidCount})` : ""}
        </Button>
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border bg-white">
        {jobs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No invoiced jobs yet. Jobs appear here once their Xero invoice has
            been created.
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="w-10 px-3 py-2" aria-label="Paid checkbox" />
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const paid = Boolean(job.invoice_paid_in_app_at)
                const client = job.properties?.client_name?.trim() || "Unknown client"
                const suburb = job.properties?.suburb?.trim()

                return (
                  <tr key={job.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={paid}
                        disabled={pending}
                        aria-label={`Mark ${client} paid`}
                        onChange={(event) =>
                          run(() =>
                            setInvoicePaidAction(job.id, event.target.checked)
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5 text-gray-900">
                      {client}
                      {suburb ? (
                        <span className="text-gray-500"> · {suburb}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {job.xero_invoice_number || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900">
                      {formatAmount(job.quoted_amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          paid
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {paid ? "Paid" : "Awaiting"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
