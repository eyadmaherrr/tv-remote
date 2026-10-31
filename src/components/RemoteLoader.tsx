"use client";

import dynamic from "next/dynamic";

/** The remote lives entirely in the browser (saved TV, pairing token, sockets), so it isn't
 *  prerendered on the server. */
export const RemoteLoader = dynamic(() => import("./Remote").then((m) => m.RemoteApp), { ssr: false });
