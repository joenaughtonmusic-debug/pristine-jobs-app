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
          <Link href="/admin/schedule">Schedule</Link>
          <Link href="/admin/estimates-calendar">Estimates</Link>
          <Link href="/admin/actions">VA Actions</Link>
          <Link href="/admin/enquiries">Enquiries</Link>
          <Link href="/admin/properties">Properties</Link>
        </div>
      </nav>

      {children}
    </div>
  )
}