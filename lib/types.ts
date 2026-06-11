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
  invoice_handling_note?: string | null
  service_type?: string | null
  service_frequency?: string | null
  service_interval_weeks?: number | null
}

export interface ScheduledJob {
  id: string
  property_id: string
  scheduled_date: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  job_type?: string | null
  job_order?: number | null
  assigned_staff_id?: string | null
  planned_duration_hours?: number | null
  planned_start_time?: string | null
  billing_mode?: string | null
  invoice_method?: string | null
time_limit_type?: string | null
quoted_scope?: string | null
quoted_materials?: string | null
  quoted_amount?: number | string | null
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
  invoice_note?: string | null
  created_at?: string
  updated_at?: string
}

export interface JobPhoto {
  id: string
  scheduled_job_id: string
  property_id?: string | null
  visit_id?: string | null
  uploaded_by?: string | null
  storage_path: string
  public_url?: string | null
  caption?: string | null
  photo_type:
    | "client_instruction"
    | "before"
    | "after"
    | "issue"
    | "completion"
    | "other"
  created_at?: string
}

export interface CompleteVisitFormData {
  hours_worked: number
  greenwaste_bags: number
  work_notes: string
  next_visit_notes: string
  ready_for_invoice: boolean
}

export type CommunicationStatus =
  | 'new'
  | 'needs_reply'
  | 'needs_scheduling'
  | 'needs_estimator'
  | 'waiting_customer'
  | 'escalate_to_joe'
  | 'closed'

export type CommunicationCategory =
  | 'quote_request'
  | 'scheduling'
  | 'maintenance_query'
  | 'invoice_payment'
  | 'complaint'
  | 'general'
  | 'internal_note'

export type CommunicationPriority = 'low' | 'normal' | 'high' | 'urgent'

export type CommunicationRiskLevel = 'low' | 'medium' | 'high'

export type CommunicationAssignee =
  | 'unassigned'
  | 'va'
  | 'estimator'
  | 'maintenance_team'
  | 'landscaping_team'
  | 'joe'

export interface Communication {
  id: string
  user_id: string
  enquiry_id?: string | null
  property_id?: string | null
  job_id?: string | null
  visit_id?: string | null
  channel: 'email' | 'sms' | 'phone' | 'internal'
  direction: 'inbound' | 'outbound'
  subject?: string | null
  body?: string | null
  metadata?: Record<string, any> | null
  external_id?: string | null
  status?: CommunicationStatus
  category?: CommunicationCategory
  priority?: CommunicationPriority
  risk_level?: CommunicationRiskLevel
  assigned_to?: CommunicationAssignee
  requires_review?: boolean
  ignored?: boolean | null
  requires_action?: boolean | null
  source_category?: string | null
  ignore_reason?: string | null
  ai_summary?: string | null
  suggested_reply?: string | null
  sent_by?: string | null
  created_at?: string
  delivered_at?: string | null
}

export interface CommunicationEnquirySummary {
  id: string
  name: string
  address?: string | null
  suburb?: string | null
}

export interface CommunicationWithEnquiry extends Communication {
  admin_enquiries?: CommunicationEnquirySummary | CommunicationEnquirySummary[] | null
}
