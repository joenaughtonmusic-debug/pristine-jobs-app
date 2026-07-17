"use client"

import { useState } from "react"
import Link from "next/link"
import type {
  AdminNavBadges,
  AdminNavGroup,
  AdminNavLink,
} from "@/lib/admin-navigation-config"

function getSectionId(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

type Props = {
  navGroups: AdminNavGroup[]
  topLevelLinks?: AdminNavLink[]
  badges?: AdminNavBadges
}

export function AdminNavigation({
  navGroups,
  topLevelLinks = [],
  badges = {},
}: Props) {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dashboardGroup, ...dropdownGroups] = navGroups

  const toggleSection = (sectionId: string) => {
    setOpenSection((current) => (current === sectionId ? null : sectionId))
  }

  const closeMenus = () => {
    setOpenSection(null)
    setMobileOpen(false)
  }

  // Real to-do counts (owner rule: never decoration). A link shows its own
  // count; a collapsed dropdown shows the sum of its links' counts so the
  // number is visible without opening the menu.
  const linkLabel = (link: AdminNavLink) =>
    badges[link.href] ? `${link.label} (${badges[link.href]})` : link.label

  const groupLabel = (group: AdminNavGroup) => {
    const total = group.links.reduce(
      (sum, link) => sum + (badges[link.href] || 0),
      0
    )

    return total ? `${group.label} (${total})` : group.label
  }

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={dashboardGroup.links[0].href}
            className="rounded-md px-3 py-2 font-medium text-gray-800 hover:bg-gray-100"
            onClick={closeMenus}
          >
            Dashboard
          </Link>

          {topLevelLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 font-medium text-gray-800 hover:bg-gray-100"
              onClick={closeMenus}
            >
              {linkLabel(link)}
            </Link>
          ))}

          {dropdownGroups.map((group) => {
            const sectionId = getSectionId(group.label)
            const isOpen = openSection === sectionId

            return (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  className="rounded-md px-3 py-2 font-medium text-gray-800 hover:bg-gray-100"
                  aria-expanded={isOpen}
                  aria-controls={`admin-nav-${sectionId}`}
                  onClick={() => toggleSection(sectionId)}
                >
                  {groupLabel(group)}
                </button>

                {isOpen && (
                  <div
                    id={`admin-nav-${sectionId}`}
                    className="absolute left-0 top-full z-20 mt-2 min-w-56 rounded-lg border bg-white p-2 shadow-lg"
                  >
                    {group.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="block rounded-md px-3 py-2 text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                        onClick={closeMenus}
                      >
                        {linkLabel(link)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="md:hidden">
          <div className="relative">
            <button
              type="button"
              className="rounded-md border px-3 py-2 font-medium text-gray-800"
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-nav"
              onClick={() => setMobileOpen((current) => !current)}
            >
              Menu
            </button>

            {mobileOpen && (
              <div
                id="admin-mobile-nav"
                className="absolute left-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-white p-3 shadow-lg"
              >
                {navGroups.map((group) => {
                  const sectionId = getSectionId(group.label)
                  const isOpen = openSection === sectionId
                  const isDashboard = group.label === "Dashboard"

                  return (
                    <section
                      key={group.label}
                      className="border-b py-2 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      {isDashboard ? (
                        <div className="grid gap-1">
                          {group.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                              onClick={closeMenus}
                            >
                              {linkLabel(link)}
                            </Link>
                          ))}
                          {topLevelLinks.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                              onClick={closeMenus}
                            >
                              {linkLabel(link)}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50"
                            aria-expanded={isOpen}
                            aria-controls={`admin-mobile-nav-${sectionId}`}
                            onClick={() => toggleSection(sectionId)}
                          >
                            {groupLabel(group)}
                            <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                          </button>

                          {isOpen && (
                            <div
                              id={`admin-mobile-nav-${sectionId}`}
                              className="mt-1 grid gap-1"
                            >
                              {group.links.map((link) => (
                                <Link
                                  key={link.href}
                                  href={link.href}
                                  className="rounded-md px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                                  onClick={closeMenus}
                                >
                                  {linkLabel(link)}
                                </Link>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="hidden text-xs font-medium text-gray-400 sm:block">
          Pristine Jobs
        </div>
      </div>
    </nav>
  )
}
