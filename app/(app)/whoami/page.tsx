import { createClient } from "@/lib/supabase/server"

export default async function WhoAmIPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div className="p-6">Not logged in</div>
  }

  const { data: staffMember } = await supabase
    .from("staff_members")
    .select("id, name, staff_type, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Who Am I?</h1>

      <p className="mt-4">Email: {user.email}</p>
      <p>User ID: {user.id}</p>

      <hr className="my-4" />

      {staffMember ? (
        <div>
          <p>Staff name: {staffMember.name}</p>
          <p>Staff type: {staffMember.staff_type}</p>
        </div>
      ) : (
        <p>No linked staff member found.</p>
      )}
    </div>
  )
}