import { gunzipSync } from "node:zlib";
import { vi } from "vitest";

import { createBrowserTracking } from "./browser";

/**
 * The real posthog-js and its real recorder, in a page, against a fake
 * PostHog: what a started recorder actually sends. The other replay tests
 * hand `createBrowserTracking` a fake SDK, so they prove what Saroh asks
 * for and nothing about what the SDK then does with it; that gap let every
 * production recording play back as a blank black screen (DEV_LEARNINGS,
 * 14 Oct 2026). A recording plays only when it has rrweb's "meta" event
 * (the page's address and size) and a full snapshot of the page.
 */

export const HOST = "https://posthog.test";
export const META = 4;
export const FULL_SNAPSHOT = 2;

export interface RrwebItem {
    type: number;
    data: {
        href?: string;
        width?: number;
        height?: number;
        node?: unknown;
    };
}
export interface Sent {
    path: string;
    events: { event: string; properties?: Record<string, unknown> }[];
}

/** PostHog as the SDK sees it: the project's settings, and an inbox. */
export function fakePostHog() {
    const sent: Sent[] = [];
    const paths: string[] = [];
    const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = new URL(String(input));
        paths.push(`${init?.method ?? "GET"} ${url.pathname}`);
        if (url.pathname.endsWith("/config"))
            return new Response(
                JSON.stringify({
                    supportedCompression: ["gzip", "gzip-js"],
                    sessionRecording: {
                        endpoint: "/s/",
                        recorderVersion: "v2",
                        scriptConfig: { script: "posthog-recorder" },
                        sampleRate: null,
                        linkedFlag: null,
                        urlTriggers: [],
                        eventTriggers: [],
                        minimumDurationMilliseconds: null,
                    },
                }),
                { status: 200 },
            );
        const body = init?.body;
        if (body) {
            let bytes: Buffer =
                typeof body === "string"
                    ? Buffer.from(body)
                    : Buffer.from(
                          body instanceof Blob
                              ? await body.arrayBuffer()
                              : (body as ArrayBuffer),
                      );
            if (bytes[0] === 0x1f && bytes[1] === 0x8b)
                bytes = gunzipSync(bytes);
            const parsed = JSON.parse(bytes.toString("utf8")) as
                | Sent["events"]
                | Sent["events"][number]
                | { batch: Sent["events"] };
            sent.push({
                path: url.pathname,
                // One event, a list of them, or a batch: the SDK uses all three.
                events: Array.isArray(parsed)
                    ? parsed
                    : "batch" in parsed
                      ? parsed.batch
                      : [parsed],
            });
        }
        return new Response(JSON.stringify({ status: 1 }), { status: 200 });
    });
    const items = (): RrwebItem[] =>
        sent.flatMap((request) =>
            request.events.flatMap(
                (event) =>
                    (event.properties?.$snapshot_data as
                        RrwebItem[] | undefined) ?? [],
            ),
        );
    return { fetcher, sent, paths, items };
}

/** Every text and attribute value in a serialized rrweb node tree. */
export function wordsOf(node: unknown, out: string[] = []): string[] {
    if (!node || typeof node !== "object") return out;
    const n = node as {
        textContent?: string;
        attributes?: Record<string, unknown>;
        childNodes?: unknown[];
    };
    if (typeof n.textContent === "string") out.push(n.textContent);
    for (const value of Object.values(n.attributes ?? {}))
        if (typeof value === "string") out.push(value);
    for (const child of n.childNodes ?? []) wordsOf(child, out);
    return out;
}

export async function until(done: () => boolean, ms = 8_000): Promise<void> {
    const end = Date.now() + ms;
    while (!done() && Date.now() < end)
        await new Promise((r) => setTimeout(r, 50));
}

export function tracker(
    app: "application" | "web",
    analytics: "on" | "off" = "off",
) {
    return createBrowserTracking({
        key: "phc_test",
        host: HOST,
        app,
        environment: "development",
        load: () => import("posthog-js/dist/module.no-external"),
        loadRecorder: () => import("posthog-js/dist/posthog-recorder"),
        replay: "on",
        analytics,
    });
}

/** What a person does first: the SDK holds a recording until then. */
export function interact() {
    const button = document.querySelector("button");
    for (const type of ["mousedown", "mouseup", "click"])
        button?.dispatchEvent(
            new MouseEvent(type, { bubbles: true, clientX: 5, clientY: 5 }),
        );
}

/** A page with Saroh's words, a business's words and something typed. */
export function page() {
    const posthog = fakePostHog();
    vi.stubGlobal("fetch", posthog.fetcher);
    window.fetch = posthog.fetcher;
    window.history.replaceState(null, "", "/commerce/orders?q=asha+rao#top");
    document.body.innerHTML = `
        <main>
            <h1 data-ph-unmask>Orders</h1>
            <p>Asha Rao owes 4200</p>
            <input value="typed secret" />
            <button data-ph-unmask>New order</button>
        </main>`;
    return posthog;
}
