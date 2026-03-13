import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { db } from "@/db/client"
import { folder } from "@/db/schema/folder"
import { auth } from "@/lib/auth"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session!.user!.id

  const { id } = await params
  const body = await request.json()
  const { emoji, name, description } = body

  const updates: Record<string, unknown> = {}
  if (typeof emoji === "string") {
    updates.emoji = emoji
  }
  if (typeof name === "string" && name.trim()) {
    updates.name = name.trim()
  }
  if (description === null) {
    updates.description = null
  } else if (typeof description === "string") {
    updates.description = description.trim().slice(0, 200) || null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const result = await db
    .update(folder)
    .set(updates)
    .where(and(eq(folder.id, id), eq(folder.userId, userId)))
    .returning({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      emoji: folder.emoji,
    })

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(result[0])
}
