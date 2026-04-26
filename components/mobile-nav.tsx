"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  {
    href: "/jobs",
    label: "Jobs",
    icon: ClipboardList,
  },
  {
    href: "/labour",
    label: "Landscape",
    icon: Clock3,
  },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="grid grid-cols-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}