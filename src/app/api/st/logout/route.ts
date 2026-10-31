import { clearSession } from "@/lib/st/server";

export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
