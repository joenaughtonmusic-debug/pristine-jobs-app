"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Leaf } from "lucide-react"

// Set a new password after a recovery link. /auth/confirm verifies the
// recovery token server-side (creating a session) and redirects here.
export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(Boolean(user))
    })
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push("/jobs")
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
              <Leaf className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          {hasSession === false ? (
            <p className="text-center text-sm text-muted-foreground">
              This page only works from a password-reset email link. Use
              &ldquo;Forgot password?&rdquo; on the{" "}
              <a href="/" className="font-medium underline">
                sign-in page
              </a>{" "}
              to request one.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-12"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm password
                  </FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-12"
                  />
                </Field>
              </FieldGroup>

              {error ? (
                <p className="mt-4 text-center text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                className="mt-6 h-12 w-full text-base"
                disabled={loading || hasSession === null}
              >
                {loading ? <Spinner className="mr-2" /> : null}
                {loading ? "Saving..." : "Save new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
