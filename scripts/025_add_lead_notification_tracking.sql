-- Track Joe email notifications for admin enquiries.
-- These timestamps prevent duplicate emails for the same lead action.

ALTER TABLE admin_enquiries
  ADD COLUMN IF NOT EXISTS joe_new_lead_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS joe_accepted_lead_notified_at TIMESTAMPTZ;
