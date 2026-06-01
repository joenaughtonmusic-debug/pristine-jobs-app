import Link from "next/link"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl gap-4 px-4 py-3 text-sm font-medium">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/schedule">Schedule</Link>
          <Link href="/admin/estimates-calendar">Estimates</Link>
          <Link href="/admin/actions">VA Actions</Link>
          <Link href="/admin/enquiries">Phone Enquiries</Link>
          <Link href="/admin/quotes">Quotes</Link>
          <Link href="/admin/quote-templates">Quote Templates</Link>
          <Link href="/admin/quoted-jobs">Quoted Jobs</Link>
          <Link href="/admin/invoices">Invoices</Link>
          <Link href="/admin/labour-reconciliation">Labour</Link>
          <Link href="/admin/internal-notes">Internal Notes</Link>
          <Link href="/admin/communications">Communications</Link>
          <Link href="/admin/properties">Properties</Link>
        </div>
      </nav>

      {children}
    </div>
  )
}
