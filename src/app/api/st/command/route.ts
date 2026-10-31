import { accessToken, stConfigured, stFetch } from "@/lib/st/server";
import { ST_ALLOWED, type StCommand } from "@/lib/st/commands";

/** POST { deviceId, command: { capability, command, arguments? } } → runs it on the TV. */
export async function POST(request: Request) {
  if (!stConfigured()) return Response.json({ error: "not-configured" }, { status: 503 });
  let body: { deviceId?: string; command?: StCommand };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { deviceId, command } = body;
  if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId) || !command) return Response.json({ error: "bad-request" }, { status: 400 });
  // Only TV-remote commands are forwarded — this isn't a general SmartThings proxy.
  if (!(ST_ALLOWED[command.capability] || []).includes(command.command)) return Response.json({ error: "not-allowed" }, { status: 400 });
  const args = (command.arguments || []).filter((a) => typeof a === "string" || typeof a === "number").slice(0, 2);

  const token = await accessToken();
  if (!token) return Response.json({ error: "signed-out" }, { status: 401 });
  const res = await stFetch(`/v1/devices/${deviceId}/commands`, token, {
    method: "POST",
    body: JSON.stringify({ commands: [{ component: "main", capability: command.capability, command: command.command, arguments: args }] }),
  });
  if (res.status === 401) return Response.json({ error: "signed-out" }, { status: 401 });
  if (!res.ok) return Response.json({ error: "smartthings", status: res.status, detail: (await res.text()).slice(0, 300) }, { status: 502 });
  return Response.json({ ok: true });
}
