import { describe, expect, it, vi } from "vitest";

import {
    qrCodeOf,
    qrRedirect,
    qrRedirectLocation,
    scanQrCode,
} from "./qr-resolve";

const ORIGIN = "https://rye.saroh.app";

function request(
    send: typeof fetch,
    over: Partial<Parameters<typeof scanQrCode>[0]> = {},
) {
    return scanQrCode({
        apiUrl: "https://api.example.test",
        siteId: "site_1",
        code: "h7c",
        headers: { "x-saroh-relay": "v1.signed" },
        userAgent: "Mozilla/5.0 (iPhone)",
        head: false,
        fetch: send,
        ...over,
    });
}

const answers = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>(() =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );

/** The JSON body the nth call sent. */
function bodyOf(send: ReturnType<typeof answers>, call = 0): unknown {
    const body = send.mock.calls[call]?.[1]?.body;
    return typeof body === "string" ? JSON.parse(body) : null;
}

describe("qrCodeOf", () => {
    it("takes a short id, lower-cased, and nothing else", () => {
        expect(qrCodeOf("h7c")).toBe("h7c");
        expect(qrCodeOf("H7C")).toBe("h7c");
        expect(qrCodeOf(" k9dq2x ")).toBe("k9dq2x");
        for (const bad of [
            undefined,
            "",
            "h7",
            "toolong1",
            "h-7",
            "h/7",
            "..",
            "h7c%2F",
        ]) {
            expect(qrCodeOf(bad)).toBeNull();
        }
    });
});

describe("scanQrCode", () => {
    it("posts to the site's scan route, signed, with the visitor's browser", async () => {
        const send = answers({ kind: "path", path: "/book", counted: true });
        expect(await request(send)).toEqual({ kind: "path", path: "/book" });
        expect(send).toHaveBeenCalledTimes(1);
        const [url, init] = send.mock.calls[0] ?? [];
        expect(url).toBe(
            "https://api.example.test/public/sites/site_1/qr/h7c/scan",
        );
        expect(init?.method).toBe("POST");
        expect(init?.cache).toBe("no-store");
        expect(init?.headers).toMatchObject({
            "x-saroh-relay": "v1.signed",
            "content-type": "application/json",
        });
        expect(bodyOf(send)).toEqual({ userAgent: "Mozilla/5.0 (iPhone)" });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("says when the request only asked for headers, and trims a long browser name", async () => {
        const send = answers({ kind: "home" });
        await request(send, { head: true, userAgent: "x".repeat(2_000) });
        const body = bodyOf(send) as { userAgent: string; head: boolean };
        expect(body.head).toBe(true);
        expect(body.userAgent).toHaveLength(512);

        const bare = answers({ kind: "home" });
        await request(bare, { userAgent: null });
        expect(bodyOf(bare)).toEqual({});
    });

    it("reads home for a retired code and missing for the API's 404", async () => {
        expect(
            await request(answers({ kind: "home", counted: false })),
        ).toEqual({ kind: "home" });
        expect(
            await request(answers({ error: { code: "NOT_FOUND" } }, 404)),
        ).toEqual({ kind: "missing" });
    });

    it("never throws: any other answer, or none, is failed", async () => {
        for (const send of [
            answers({ error: {} }, 401),
            answers({ error: {} }, 409),
            answers({ error: {} }, 429),
            answers({ error: {} }, 500),
            answers({ kind: "path" }),
            answers({ kind: "path", path: 7 }),
            answers({ kind: "elsewhere", path: "/x" }),
            answers(null),
            vi.fn<typeof fetch>(() =>
                Promise.resolve(new Response("<html>", { status: 200 })),
            ),
            vi.fn<typeof fetch>(() => Promise.reject(new Error("down"))),
        ]) {
            expect(await request(send)).toEqual({ kind: "failed" });
        }
    });

    it("stops waiting for an API that doesn't answer", async () => {
        const hangs = vi.fn<typeof fetch>(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(new Error("aborted"));
                    });
                }),
        );
        expect(await request(hangs, { timeoutMs: 10 })).toEqual({
            kind: "failed",
        });
    });
});

describe("qrRedirectLocation", () => {
    const to = (path: string, origin = ORIGIN) =>
        qrRedirectLocation(origin, { kind: "path", path }, "h7c");

    it("is absolute, on the origin asked, with the tag", () => {
        expect(to("/book")).toBe("https://rye.saroh.app/book?src=qr-h7c");
        expect(to("/")).toBe("https://rye.saroh.app/?src=qr-h7c");
        expect(to("/shop/rye%20loaf")).toBe(
            "https://rye.saroh.app/shop/rye%20loaf?src=qr-h7c",
        );
        // A custom domain, and a local one over http with its port.
        expect(to("/book", "https://www.ryebakery.in")).toBe(
            "https://www.ryebakery.in/book?src=qr-h7c",
        );
        expect(to("/book", "http://rye.saroh.app.localhost:3005")).toBe(
            "http://rye.saroh.app.localhost:3005/book?src=qr-h7c",
        );
        for (const location of [to("/book"), to("/")]) {
            expect(() => new URL(location)).not.toThrow();
        }
    });

    it("keeps a query the target already has, and replaces a tag it carried", () => {
        expect(to("/book?service=cut&when=today")).toBe(
            "https://rye.saroh.app/book?service=cut&when=today&src=qr-h7c",
        );
        expect(to("/shop?src=newsletter")).toBe(
            "https://rye.saroh.app/shop?src=qr-h7c",
        );
        expect(to("/menu#lunch")).toBe("https://rye.saroh.app/menu?src=qr-h7c");
    });

    it("sends a retired code, a failed read and an unknown answer home, untagged", () => {
        for (const scan of [
            { kind: "home" },
            { kind: "failed" },
            { kind: "missing" },
        ] as const) {
            expect(qrRedirectLocation(ORIGIN, scan, "h7c")).toBe(
                "https://rye.saroh.app/",
            );
        }
    });

    it("never leaves the site, whatever the answer says", () => {
        for (const path of [
            "//evil.example/x",
            "https://evil.example/x",
            "/\\evil.example",
            "\\\\evil.example",
            "javascript:alert(1)",
            "book",
            "",
        ]) {
            expect(to(path)).toBe("https://rye.saroh.app/");
        }
    });
});

describe("qrRedirect", () => {
    it("is a 302 that is never kept or indexed", () => {
        const res = qrRedirect("https://rye.saroh.app/book?src=qr-h7c");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(
            "https://rye.saroh.app/book?src=qr-h7c",
        );
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
        expect(res.body).toBeNull();
    });
});
