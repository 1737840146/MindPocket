import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })

  return Response.json({
    name: session?.user?.name,
    email: session?.user?.email,
    avatar: session?.user?.image || "",
  })
}
