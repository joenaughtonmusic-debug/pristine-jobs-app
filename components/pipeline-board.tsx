import Link from "next/link"
import { AddLeadForm } from "@/components/add-lead-form"
import { PipelineRow } from "@/components/pipeline-row"
import { BOARD_STAGES, isOnActiveBoard, type SalesLead } from "@/lib/sales-leads"

type Props = {
  leads: SalesLead[]
}

// Board shell: server-rendered. One row per client across six stage columns.
// Each row (PipelineRow) is an interactive client component owning its own
// expand/collapse drawer; the board itself stays a server component.
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
          the stages already completed. Click a card to expand its details.
        </p>
      </header>

      <AddLeadForm />

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
            boardLeads.map((lead) => <PipelineRow key={lead.id} lead={lead} />)
          )}
        </div>
      </div>
    </div>
  )
}
