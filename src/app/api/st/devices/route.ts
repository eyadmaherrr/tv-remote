import { connection } from "next/server";
import { auth, json, stConfigured, stFetch } from "@/lib/st/server";

interface StDevice {
  deviceId: string;
  label?: string;
  name?: string;
  ocf?: { ocfDeviceType?: string };
  components?: { id: string; capabilities: { id: string }[]; categories?: { name: string }[] }[];
}

/** The signed-in account's TVs: { configured, signedIn, tvs: [{ id, name }] }. */
export async function GET(request: Request) {
  await connection(); // per-user and per-request: never prerender
  if (!stConfigured()) return Response.json({ configured: false, signedIn: false, tvs: [] });
  const a = await auth(request);
  const token = a.token;
  if (!token) return Response.json({ configured: true, signedIn: false, tvs: [] });
  const res = await stFetch("/v1/devices", token);
  if (res.status === 401) return Response.json({ configured: true, signedIn: false, tvs: [] });
  if (!res.ok) return json({ configured: true, signedIn: true, tvs: [], error: "SmartThings error " + res.status }, a, { status: 502 });
  const { items = [] } = (await res.json()) as { items?: StDevice[] };
  const tvs = items
    .filter((d) => {
      const main = d.components?.find((c) => c.id === "main");
      return (
        d.ocf?.ocfDeviceType === "oic.d.tv" ||
        !!main?.categories?.some((c) => c.name === "Television") ||
        !!main?.capabilities.some((c) => c.id === "samsungvd.remoteControl")
      );
    })
    .map((d) => ({ id: d.deviceId, name: d.label || d.name || "Samsung TV" }));
  return json({ configured: true, signedIn: true, tvs }, a);
}
