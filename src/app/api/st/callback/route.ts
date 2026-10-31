import { redirect } from "next/navigation";
import { finishLogin, stConfigured } from "@/lib/st/server";

/** SmartThings sends the user back here after sign-in. */
export async function GET(request: Request) {
  if (!stConfigured()) return new Response("SmartThings isn't set up on this site.", { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code) redirect("/?st=" + encodeURIComponent(url.searchParams.get("error") || "cancelled"));
  let failed = "";
  try {
    await finishLogin(url.origin, code, state);
  } catch (e) {
    failed = e instanceof Error ? e.message : "sign-in failed";
  }
  redirect(failed ? "/?st=" + encodeURIComponent(failed) : "/?st=ok");
}
