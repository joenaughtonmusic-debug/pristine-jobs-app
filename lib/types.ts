export interface Property {
  id: string
  property_code?: string
  client_name: string
  client_email?: string | null
  address_line_1?: string | null
  suburb?: string | null
  city?: string | null
  access_notes?: string | null
  permanent_notes?: string | null
  billing_type?: string | null
  hourly_rate?: number | null
  greenwaste_rate?: number | null
  xero_contact_id?: string | null
  is_active?: boolean | null
  property_notes_url?: string | null
  property_category?: string | null
}

export interface ScheduledJob {
  id: string
  property_id: string
  scheduled_date: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  job_order?: number | null
  assigned_staff_id?: string | null
  planned_duration_hours?: number | null
  planned_start_time?: string | null
  billing_mode?: string | null
time_limit_type?: string | null
quoted_scope?: string | null
quoted_materials?: string | null
  created_at?: string
  updated_at?: string
  properties?: Property
  visits?: Visit[]
}

export interface Visit {
  id: string
  scheduled_job_id?: string | null
  property_id: string
  visit_date: string
  hours_worked: number
  greenwaste_bags: number
  work_notes: string | null
  next_visit_notes: string | null
  completion_status: string
  ready_for_invoice: boolean
  invoice_status: string
  created_at?: string
  updated_at?: string
}

export interface CompleteVisitFormData {
  hours_worked: number
  greenwaste_bags: number
  work_notes: string
  next_visit_notes: string
  ready_for_invoice: boolean
}
