import Link from "next/link"
import { Check } from "lucide-react"
import {
  BOARD_STAGES,
  getBoardStageIndex,
  isOnActiveBoard,
  type SalesLead,
} from "@/lib/sales-leads"

type Props = {
  leads: SalesLead[]
}

// Compact card subtitle: "suburb · service" (Phase1 spec §3).
function cardSubtitle(lead: SalesLead) {
  const parts = [lead.suburb?.trim(), lead.service_needed?.trim()].filter(
    Boolean
  )
  return parts.length > 0 ? parts.join(" · ") : "Details not set"
}

// Slice 1: read-only board shell. One row per client across six stage columns.
// The card sits in the client's current stage; cells to its left show a faint
// tick (the completed-stage staircase); cells to its right are empty. No
// actions or expand drawer yet — those arrive in later slices.
export function PipelineBoard({ leads = [] }: Props) {
  const boardLeads = leads.filter(isOnActiveBoard)

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <p className="text-sm text-gray-500">
          <Link href="/admin" className="hover:text-gray-800">
            Admin
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-gray-900">Sales Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          One row per client. Each card sits in its current stage; ticks show
          the stages already completed.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-6 border-b bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            {BOARD_STAGES.map((stage) => (
              <div key={stage.key} className="px-3 py-3 text-center">
                {stage.label}
              </div>
            ))}
          </div>

          {boardLeads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              No active leads yet.
            </div>
          ) : (
            boardLeads.map((lead) => {
              const stageIndex = getBoardStageIndex(lead.status)

              return (
                <div
                  key={lead.id}
                  className="grid grid-cols-6 border-b last:border-b-0"
                >
                  {BOARD_STAGES.map((stage, index) => (
                    <div
                      key={stage.key}
                      className="flex min-h-[92px] items-center justify-center px-2 py-3"
                    >
                      {index === stageIndex ? (
                        <div className="w-full max-w-[190px] rounded-lg border border-gray-300 bg-white p-3 shadow-sm">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {lead.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {cardSubtitle(lead)}
                          </p>
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
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
