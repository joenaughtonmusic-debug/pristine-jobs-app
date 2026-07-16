import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Leaf } from "lucide-react"

// Landing page for failed auth links (expired magic link, used recovery
// link, bad code exchange). Referenced by /auth/callback and /auth/confirm.
export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
              <Leaf className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Link didn&apos;t work</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            That sign-in link is invalid or has expired — they can only be
            used once. Request a fresh one and try again.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium underline"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
