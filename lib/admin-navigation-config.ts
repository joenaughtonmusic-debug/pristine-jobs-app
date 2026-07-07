export type AdminNavLink = {
  href: string
  label: string
}

export type AdminNavGroup = {
  label: string
  links: AdminNavLink[]
}

export const adminTopLevelLinks: AdminNavLink[] = [
  { href: "/sales-pipeline", label: "Sales Pipeline" },
]

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Dashboard",
    links: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    label: "Work Pipeline",
    links: [
      { href: "/admin/enquiries", label: "Enquiries" },
      { href: "/admin/estimates-calendar", label: "Estimates" },
      { href: "/admin/quotes", label: "Quotes" },
      { href: "/admin/quoted-jobs", label: "Quoted Jobs" },
      { href: "/admin/schedule", label: "Schedule" },
      { href: "/admin/cost-capture", label: "Cost Capture" },
      { href: "/admin/invoices", label: "Invoices" },
      { href: "/admin/properties", label: "Properties" },
    ],
  },
  {
    label: "Communications",
    links: [
      { href: "/admin/communications", label: "Communications" },
      { href: "/admin/internal-notes", label: "Team Notes" },
      { href: "/admin/actions", label: "Admin Actions" },
    ],
  },
  {
    label: "Team",
    links: [
      { href: "/admin/team-hub", label: "Team Hub" },
      { href: "/admin/job-board", label: "Team Job Board" },
      { href: "/admin/labour-reconciliation", label: "Labour Reconciliation" },
      { href: "/labour", label: "Staff Labour" },
    ],
  },
  {
    label: "Settings",
    links: [
      { href: "/admin/quote-templates", label: "Template Settings" },
      { href: "/settings", label: "Settings" },
      { href: "/admin/profitability", label: "Profitability" },
    ],
  },
]
