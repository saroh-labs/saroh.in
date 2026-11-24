import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect } from "vitest";

import { ORG_HEADER } from "@/lib/query/api-read";
import { makeQueryClient } from "@/lib/query/client";
import { OrgProvider } from "@/lib/query/org";
import { prefetchRead } from "@/lib/query/prefetch";
import type { ServerRead } from "@/lib/query/route";

/** For tests only (DEC-259): a client, a render, a route's requests and its matrix. */

/** A client with the app's defaults, new for each test. */
export const makeTestClient = (): QueryClient => makeQueryClient();

/** Render inside React Query and a business, as the shell does. jsdom only. */
export function renderWithQuery(
    ui: React.ReactNode,
    {
        client = makeTestClient(),
        orgId = "org_1",
    }: { client?: QueryClient; orgId?: string } = {},
) {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
        root.render(
            <QueryClientProvider client={client}>
                <OrgProvider orgId={orgId}>{ui}</OrgProvider>
            </QueryClientProvider>,
        ),
    );
    return {
        host,
        client,
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

const HOST = "app.saroh.localhost";

/** A read route's request as the app's own page sends it. */
export function readRequest(
    path: string,
    {
        params = {},
        orgId,
        headers = {},
    }: {
        params?: Record<string, string>;
        orgId?: string;
        headers?: Record<string, string>;
    } = {},
): Request {
    const qs = new URLSearchParams(params).toString();
    return new Request(`https://${HOST}${path}${qs ? `?${qs}` : ""}`, {
        headers: {
            host: HOST,
            "sec-fetch-site": "same-origin",
            ...(orgId ? { [ORG_HEADER]: orgId } : {}),
            ...headers,
        },
    });
}

/** Every answer of a read route, refusals included, is private and generic. */
export async function expectLockedDown(res: Response): Promise<void> {
    expect(res.headers.get("cache-control")).toBe("private,no-store");
    expect(res.headers.get("vary")).toBe("Cookie");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    if (!res.ok) {
        const body = (await res.clone().json()) as Record<string, unknown>;
        expect(Object.keys(body)).toEqual(["code"]);
    }
}

/**
 * A route's authz matrix: each row sets up who is asking (owner, member,
 * Reviewer, calendar-only, signed out, another business's id) and the
 * status the page's own gate gives them. All rows are compared at once, so
 * a failure shows the whole table.
 */
export async function expectAuthzMatrix(
    rows: Record<string, { as: () => unknown; status: number }>,
    call: () => Promise<Response>,
): Promise<void> {
    const want: Record<string, number> = {};
    const got: Record<string, number> = {};
    for (const [who, row] of Object.entries(rows)) {
        await row.as();
        const res = await call();
        await expectLockedDown(res);
        want[who] = row.status;
        got[who] = res.status;
    }
    expect(got).toEqual(want);
}

/**
 * A domain's contract test: the page's prefetch and the route's answer are
 * the same JSON, for fixtures with a Date, an `undefined` field and the
 * like. The test mocks the active business as `orgId`.
 */
export async function expectReadContract<P, T>(
    def: ServerRead<P, T>,
    GET: (request: Request) => Promise<Response>,
    orgId: string,
    params: P,
    query: Record<string, string> = {},
): Promise<void> {
    const client = makeTestClient();
    await prefetchRead(client, def, orgId, params);
    const prefetched = client.getQueryData(def.read.key(orgId, params));
    const res = await GET(readRequest(def.read.path, { orgId, params: query }));
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual(prefetched);
}
