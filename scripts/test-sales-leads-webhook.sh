#!/usr/bin/env bash
set -euo pipefail

# Example POST for /api/public/sales-leads
# Usage:
#   SALES_LEADS_WEBHOOK_SECRET=your-secret ./scripts/test-sales-leads-webhook.sh
#   BASE_URL=https://your-app.vercel.app SALES_LEADS_WEBHOOK_SECRET=your-secret ./scripts/test-sales-leads-webhook.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${SALES_LEADS_WEBHOOK_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "Set SALES_LEADS_WEBHOOK_SECRET before running this script." >&2
  exit 1
fi

curl -sS -X POST "${BASE_URL}/api/public/sales-leads" \
  -H "Content-Type: application/json" \
  -H "x-pristine-leads-secret: ${SECRET}" \
  -d '{
    "name": "Test Website Lead",
    "email": "test@example.com",
    "phone": "021 000 0000",
    "suburb": "Glen Eden",
    "service_needed": "Garden Tidy Up",
    "outcome": "Make the property look ready for sale, tenants or visitors",
    "garden_size": "Medium / typical suburban garden",
    "message": "Large amount of weeds in and around vege beds, general garden tidy up, trim, dead tree removal. Large grass area, leaves, etc. Some dead areas.",
    "source": "website",
    "page_url": "https://www.pristinegardens.co.nz/contact/"
  }' | python3 -m json.tool

echo
echo "If successful, open /sales-pipeline and confirm the lead appears under New."
