import { redirect } from "next/navigation";
import { APP_REDIRECT, finishLogin, loginIsForApp, stConfigured } from "@/lib/st/server";

/** SmartThings sends the user back here after sign-in. */
export async function GET(request: Request) {
  if (!stConfigured()) return new Response("SmartThings isn't set up on this site.", { status: 503 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const forApp = await loginIsForApp();
  const fail = (message: string) =>
    redirect(forApp ? APP_REDIRECT + "?error=" + encodeURIComponent(message) : "/?st=" + encodeURIComponent(message));
  if (!code) fail(url.searchParams.get("error") || "cancelled");
  let failed = "";
  let appSession: string | undefined;
  try {
    ({ appSession } = await finishLogin(url.origin, code as string, state));
  } catch (e) {
    failed = e instanceof Error ? e.message : "sign-in failed";
  }
  if (failed) fail(failed);
  // The app gets its (encrypted) session back through its own URL scheme; the website keeps a cookie.
  redirect(appSession ? APP_REDIRECT + "?session=" + encodeURIComponent(appSession) : "/?st=ok");
}
