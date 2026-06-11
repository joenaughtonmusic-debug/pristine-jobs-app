import type { SupabaseClient } from "@supabase/supabase-js"

export type WorkflowAdminActionInput = {
  title: string
  actionType: string
  priority?: "low" | "normal" | "high" | "urgent"
  owner?: string
  dueDate?: string | null
  notes?: string | null
  propertyId?: string | null
  scheduledJobId?: string | null
  sourceRecordType: string
  sourceRecordId: string
  sourceUrl: string
}

function actionKey(action: Pick<WorkflowAdminActionInput, "sourceRecordType" | "sourceRecordId" | "actionType">) {
  return `${action.sourceRecordType}:${action.sourceRecordId}:${action.actionType}`
}

export function getActionDueDate(daysFromToday = 1) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export async function ensureWorkflowAdminActions(
  supabase: SupabaseClient,
  inputs: WorkflowAdminActionInput[]
) {
  const actions = inputs.filter(
    (input) =>
      input.title.trim() &&
      input.sourceRecordType.trim() &&
      input.sourceRecordId.trim() &&
      input.actionType.trim()
  )

  if (actions.length === 0) return

  const sourceRecordIds = Array.from(
    new Set(actions.map((action) => action.sourceRecordId))
  )
  const sourceRecordTypes = Array.from(
    new Set(actions.map((action) => action.sourceRecordType))
  )

  const { data: existingActions, error: existingError } = await supabase
    .from("admin_actions")
    .select("source_record_type, source_record_id, action_type")
    .in("source_record_id", sourceRecordIds)
    .in("source_record_type", sourceRecordTypes)
    .neq("status", "done")

  if (existingError) {
    console.error("Error checking workflow admin actions", existingError.message)
    return
  }

  const existingKeys = new Set(
    (existingActions || []).map((action) =>
      actionKey({
        sourceRecordType: action.source_record_type || "",
        sourceRecordId: action.source_record_id || "",
        actionType: action.action_type || "",
      })
    )
  )

  const rowsToInsert = actions
    .filter((action) => !existingKeys.has(actionKey(action)))
    .map((action) => ({
      title: action.title.trim(),
      action_type: action.actionType,
      priority: action.priority || "normal",
      status: "open",
      property_id: action.propertyId || null,
      scheduled_job_id: action.scheduledJobId || null,
      due_date: action.dueDate || getActionDueDate(),
      notes: action.notes?.trim() || null,
      assigned_to: action.owner || "VA",
      source_record_type: action.sourceRecordType,
      source_record_id: action.sourceRecordId,
      source_url: action.sourceUrl,
    }))

  if (rowsToInsert.length === 0) return

  const { error: insertError } = await supabase
    .from("admin_actions")
    .insert(rowsToInsert)

  if (insertError) {
    console.error("Error creating workflow admin actions", insertError.message)
  }
}
