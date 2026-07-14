"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronRight } from "lucide-react"
import {
  BOARD_STAGES,
  formatActivityType,
  formatDateTime,
  getBoardStageIndex,
  parseNotes,
  type SalesLead,
} from "@/lib/sales-leads"

// Compact card subtitle: "suburb · service" (Phase1 spec §3).
function cardSubtitle(lead: SalesLead) {
  const parts = [lead.suburb?.trim(), lead.service_needed?.trim()].filter(
    Boolean
  )
  return parts.length > 0 ? parts.join(" · ") : "Details not set"
}

// Slice 2: one client row across the six stage columns, with an in-place
// expand/collapse drawer. The card is the only interactive part; the board that
// renders these rows stays a server component. Display only — no writes, no
// stage advancement, no sends. The stage's primary action button is Slice 3.
export function PipelineRow({ lead }: { lead: SalesLead }) {
  const [expanded, setExpanded] = useState(false)
  const stageIndex = getBoardStageIndex(lead.status)
  const activities = parseNotes(lead.notes)

  return (
    <div className="border-b last:border-b-0">
      <div className="grid grid-cols-6">
        {BOARD_STAGES.map((stage, index) => (
          <div
            key={stage.key}
            className="flex min-h-[92px] items-center justify-center px-2 py-3"
          >
            {index === stageIndex ? (
              <div
                className={`w-full max-w-[190px] rounded-lg border bg-white p-3 shadow-sm transition-colors ${
                  expanded ? "border-gray-900" : "border-gray-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-2 text-left"
                >
                  {expanded ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {lead.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                      {cardSubtitle(lead)}
                    </span>
                  </span>
                </button>
                {/* Stage primary action button lands here in Slice 3. */}
              </div>
            ) : index < stageIndex ? (
              <Check
                className="h-4 w-4 text-gray-300"
                aria-label={`${stage.label} completed`}
              />
            ) : null}
          </div>
        ))}
      </div>

      {expanded ? (
        <div className="border-t bg-gray-50 px-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DrawerField label="Source" value={lead.source} />
            <DrawerField
              label="Current stage"
              value={BOARD_STAGES[stageIndex]?.label}
            />
          </div>

          <section className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Enquiry / notes
            </h4>
            {lead.message?.trim() ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                {lead.message}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                No enquiry notes recorded.
              </p>
            )}
          </section>

          <section className="mt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Message thread
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              No dedicated message-thread field exists yet — showing the lead
              activity log (<code>sales_leads.notes</code>), which includes any
              logged communications. A true send/reply thread is a later slice.
            </p>
            {activities.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No activity logged.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {activities.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-l-2 border-gray-200 pl-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {formatActivityType(entry.type)}
                      </span>
                      <span>{formatDateTime(entry.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                      {entry.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Secondary actions: visible but stubbed. Wired in Slice 3. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <StubButton label="Mark lost" />
            <StubButton label="Edit details" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DrawerField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-900">{value?.trim() || "—"}</p>
    </div>
  )
}

function StubButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Coming in Slice 3"
      className="cursor-not-allowed rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400"
    >
      {label}
    </button>
  )
}
