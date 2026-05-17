"use client"

import { useMemo, useState } from "react"
import { NewPropertyModal } from "@/components/new-property-modal"

type Property = {
  id: string
  property_code: string
  client_name: string
  address_line_1: string | null
  suburb: string | null
  property_category: string | null
  is_active: boolean
}

type Props = {
  properties: Property[]
}

function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function AdminEstimatesCalendar({ properties }: Props) {
  const [newPropertyOpen, setNewPropertyOpen] = useState(false)
  const [propertySearch, setPropertySearch] = useState("")

  const monday = getMonday(new Date())

  const thisWeek = [0, 1, 2, 3, 4].map((d) => addDays(monday, d))
  const nextWeek = [7, 8, 9, 10, 11].map((d) => addDays(monday, d))

  const filteredProperties = useMemo(() => {
    const search = propertySearch.trim().toLowerCase()

    if (!search) return []

    return properties.filter((property) => {
      const searchableText = [
        property.property_code,
        property.client_name,
        property.address_line_1,
        property.suburb,
        property.property_category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchableText.includes(search)
    })
  }, [properties, propertySearch])

  const renderWeek = (title: string, days: Date[]) => (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>

      <div className="grid gap-4 md:grid-cols-5">
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="rounded-xl border bg-gray-50 p-3"
          >
            <div className="mb-3">
              <div className="font-semibold">{formatDay(day)}</div>
              <div className="text-xs text-gray-500">No appointments</div>
            </div>

            <div className="rounded-lg border border-dashed bg-white p-3 text-sm text-gray-400">
              Empty
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 pb-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Estimates Calendar</h1>

        <p className="text-sm text-gray-500">
          Site visits, estimates, follow-ups and customer care scheduling.
        </p>
      </header>

      {renderWeek("This Week", thisWeek)}

      {renderWeek("Next Week", nextWeek)}

      <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Add Estimate</h2>

        <p className="mb-4 text-sm text-gray-500">
          Add a new property or search existing customers before booking an
          estimate.
        </p>

        <button
          type="button"
          onClick={() => setNewPropertyOpen(true)}
          className="mb-4 flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add New Property
        </button>

        <input
          className="h-11 w-full rounded-md border px-3"
          placeholder="Search existing property by code, client, address..."
          value={propertySearch}
          onChange={(e) => setPropertySearch(e.target.value)}
        />

        {propertySearch && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {filteredProperties.length > 0 ? (
              filteredProperties.map((property) => (
                <div
                  key={property.id}
                  className="rounded-lg border p-3"
                >
                  <div className="font-medium">{property.client_name}</div>

                  <div className="text-sm text-gray-500">
                    {property.address_line_1 || "No address"}
                  </div>

                  <div className="mt-1 text-xs text-gray-400">
                    {property.property_code}
                    {property.suburb ? ` · ${property.suburb}` : ""}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-gray-400">
                No matching properties found.
              </p>
            )}
          </div>
        )}
      </section>

      <NewPropertyModal
        open={newPropertyOpen}
        onOpenChange={setNewPropertyOpen}
      />
    </div>
  )
}