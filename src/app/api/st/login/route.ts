import { redirect } from "next/navigation";
import { beginLogin, stConfigured } from "@/lib/st/server";

/** Sends the user to Samsung's SmartThings sign-in page. `?client=app` for the mobile app. */
export async function GET(request: Request) {
  if (!stConfigured()) return new Response("SmartThings isn't set up on this site.", { status: 503 });
  const url = new URL(request.url);
  redirect(await beginLogin(url.origin, url.searchParams.get("client") === "app"));
}
