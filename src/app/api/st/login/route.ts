import { redirect } from "next/navigation";
import { beginLogin, stConfigured } from "@/lib/st/server";

/** Sends the user to Samsung's SmartThings sign-in page. */
export async function GET(request: Request) {
  if (!stConfigured()) return new Response("SmartThings isn't set up on this site.", { status: 503 });
  redirect(await beginLogin(new URL(request.url).origin));
}
