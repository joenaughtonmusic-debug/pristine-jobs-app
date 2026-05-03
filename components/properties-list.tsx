"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Building2, Plus, ChevronRight } from "lucide-react"
import type { Property } from "@/lib/types"
import { PropertyDialog } from "./property-dialog"

interface PropertiesListProps {
  properties: Property[]
}

export function PropertiesList({ properties: initialProperties }: PropertiesListProps) {
  const [properties, setProperties] = useState(initialProperties)
  const [showDialog, setShowDialog] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)

  const handleSuccess = (property: Property, isNew: boolean) => {
    if (isNew) {
      setProperties((prev) => [...prev, property].sort((a, b) => 
        a.client_name.localeCompare(b.client_name)
      ))
    } else {
      setProperties((prev) =>
        prev.map((p) => (p.id === property.id ? property : p))
      )
    }
    setShowDialog(false)
    setEditingProperty(null)
  }

  const handleEdit = (property: Property) => {
    setEditingProperty(property)
    setShowDialog(true)
  }

  const handleClose = () => {
    setShowDialog(false)
    setEditingProperty(null)
  }

  return (
    <>
      <div className="mb-4">
        <Button onClick={() => setShowDialog(true)} className="w-full h-12">
          <Plus className="w-5 h-5 mr-2" />
          Add Property
        </Button>
      </div>

      {properties.length === 0 ? (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
    <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
    <h3 className="text-lg font-semibold">No properties yet</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      Add your first property to get started.
    </p>
  </div>
) : (
        <div className="flex flex-col gap-3">
          {properties.map((property) => (
            <Card
              key={property.id}
              className="hover:border-primary/50 transition-colors cursor-pointer active:scale-[0.99]"
              onClick={() => handleEdit(property)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground truncate">
                        {property.client_name}
                      </h3>
                      {property.xero_contact_id && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Xero
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="text-sm truncate">{property.address_line_1}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PropertyDialog
        open={showDialog}
        onOpenChange={handleClose}
        property={editingProperty}
        onSuccess={handleSuccess}
      />
    </>
  )
}
