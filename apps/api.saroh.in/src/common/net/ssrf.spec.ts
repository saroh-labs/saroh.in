import type { Resolver, Transport, TransportRequest } from "./ssrf";
import { checkStrictUrl, strictFetch } from "./ssrf";

/** The strict request webhooks, CIMD and `upload_image` share (plan 2026-11-10-001, U13). */

const ok: Transport = () =>
    Promise.resolve({
        status: 200,
        headers: {},
        body: Buffer.from("ok"),
        truncated: false,
    });

const resolvesTo =
    (...addresses: string[]): Resolver =>
    () =>
        Promise.resolve(addresses.map((address) => ({ address, family: 4 })));

const REQ = {
    method: "POST" as const,
    body: "{}",
    timeoutMs: 1000,
    maxBytes: 2048,
};

describe("checkStrictUrl", () => {
    it.each([
        ["http://hooks.example.com/x", "scheme"],
        ["hooks.example.com/x", "scheme"],
        ["https://localhost/x", "local-name"],
        ["https://10.0.0.1/x", "private-address"],
        ["https://169.254.169.254/latest", "private-address"],
        ["https://[::ffff:127.0.0.1]/", "private-address"],
        ["https://hooks.example.com:8443/x", "port"],
        ["https://user:pw@hooks.example.com/x", "credentials"],
        ["https://printer.internal/x", "local-name"],
    ])("refuses %s (%s)", (url, reason) => {
        const check = checkStrictUrl(url);
        expect(check.ok).toBe(false);
        expect(!check.ok && check.reason).toBe(reason);
    });

    it("takes a public https address on 443", () => {
        expect(checkStrictUrl("https://hooks.example.com:443/saroh").ok).toBe(
            true,
        );
    });
});

describe("strictFetch", () => {
    it("refuses a name that resolves to a private address, before connecting", async () => {
        const transport = jest.fn(ok);
        const out = await strictFetch("https://hooks.example.com/x", REQ, {
            resolve: resolvesTo("10.1.2.3"),
            transport,
        });
        expect(out).toEqual({
            ok: false,
            failure: "blocked",
            reason: "private-address",
        });
        expect(transport).not.toHaveBeenCalled();
    });

    it("resolves once and connects to the address it vetted (a rebinding name can't move it)", async () => {
        let calls = 0;
        // Public the first time it is asked, private after.
        const rebinding: Resolver = () =>
            Promise.resolve([
                {
                    address: calls++ === 0 ? "93.184.216.34" : "127.0.0.1",
                    family: 4,
                },
            ]);
        const seen: TransportRequest[] = [];
        const out = await strictFetch("https://hooks.example.com/x", REQ, {
            resolve: rebinding,
            transport: (r) => {
                seen.push(r);
                return ok(r);
            },
        });
        expect(out.ok).toBe(true);
        expect(calls).toBe(1);
        expect(seen[0].pinned).toEqual({ address: "93.184.216.34", family: 4 });
        // The name stays on the request: SNI and the certificate check use it.
        expect(seen[0].url.hostname).toBe("hooks.example.com");

        // Sent again later, the name now points inside: refused at connect.
        const again = await strictFetch("https://hooks.example.com/x", REQ, {
            resolve: rebinding,
            transport: ok,
        });
        expect(again).toEqual({
            ok: false,
            failure: "blocked",
            reason: "private-address",
        });
    });

    it("never follows a redirect: a 302 to the metadata address is a failure", async () => {
        const transport = jest.fn<ReturnType<Transport>, Parameters<Transport>>(
            () =>
                Promise.resolve({
                    status: 302,
                    headers: {
                        location: "http://169.254.169.254/latest/meta-data",
                    },
                    body: Buffer.alloc(0),
                    truncated: false,
                }),
        );
        const out = await strictFetch("https://hooks.example.com/x", REQ, {
            resolve: resolvesTo("93.184.216.34"),
            transport,
        });
        expect(out).toEqual({
            ok: false,
            failure: "blocked",
            reason: "redirect",
        });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it("passes the method, body and headers, and answers any non-redirect status", async () => {
        const seen: TransportRequest[] = [];
        const out = await strictFetch(
            "https://hooks.example.com/x",
            { ...REQ, headers: { "x-a": "1" } },
            {
                resolve: resolvesTo("93.184.216.34"),
                transport: (r) => {
                    seen.push(r);
                    return Promise.resolve({
                        status: 500,
                        headers: {},
                        body: Buffer.from("down"),
                        truncated: false,
                    });
                },
            },
        );
        expect(out.ok && out.status).toBe(500);
        expect(seen[0]).toMatchObject({
            method: "POST",
            body: "{}",
            headers: { "x-a": "1" },
            maxBytes: 2048,
        });
    });

    it("times out a receiver that never answers", async () => {
        const out = await strictFetch(
            "https://hooks.example.com/x",
            { ...REQ, timeoutMs: 20 },
            {
                resolve: resolvesTo("93.184.216.34"),
                transport: ({ signal }) =>
                    new Promise((_, reject) =>
                        signal.addEventListener("abort", () =>
                            reject(new Error("aborted")),
                        ),
                    ),
            },
        );
        expect(out).toEqual({
            ok: false,
            failure: "timeout",
            reason: "network",
        });
    });
});
