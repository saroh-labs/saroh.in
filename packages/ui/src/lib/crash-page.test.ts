import { afterEach, describe, expect, it, vi } from "vitest";

import { crashPageHtml, withCrashPage } from "./crash-page";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("crashPageHtml", () => {
    it("is a self-contained Saroh page: wordmark, eyebrow, heading, the way on", () => {
        const html = crashPageHtml({
            brand: "saroh",
            homeHref: "/",
            homeLabel: "Back to Home",
        });

        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain('aria-label="Saroh"');
        expect(html).toContain('<p class="crash-eyebrow">500</p>');
        expect(html).toContain(
            '<h1 id="crash-title">Something went wrong</h1>',
        );
        // Try again reloads the address, with no script.
        expect(html).toContain('<a class="crash-action" href="">Try again</a>');
        expect(html).toContain('href="/">Back to Home</a>');
        expect(html).not.toContain("<script");
        expect(html).not.toMatch(/<link[^>]+stylesheet/);
    });

    it("draws a merchant site's page with nothing of Saroh's", () => {
        const html = crashPageHtml({ brand: "neutral" });

        // Only the scoping class names Saroh; nothing a visitor sees does.
        expect(html.split("saroh-crash").join("")).not.toMatch(/saroh/i);
        expect(html).not.toContain("<svg");
        expect(html).toContain("This page isn’t loading");
        // No home on a host whose home may be what failed, unless asked.
        expect(html).not.toContain("Back to home");
    });

    it("escapes the words it is given", () => {
        const html = crashPageHtml({
            brand: "saroh",
            title: "<b>x</b>",
        });
        expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });
});

describe("withCrashPage", () => {
    const ctx = {};

    it("passes the handler's response through untouched", async () => {
        const ok = new Response("hello", { status: 200 });
        const fetch = withCrashPage(() => ok, { brand: "saroh" });

        await expect(
            fetch(new Request("https://app.saroh.in/"), {}, ctx),
        ).resolves.toBe(ok);
    });

    it("turns a thrown handler into the crash page, a 500 that isn't kept", async () => {
        const log = vi.fn();
        const fetch = withCrashPage(() => Promise.reject(new Error("boom")), {
            brand: "saroh",
            homeHref: "/",
            log,
        });

        const res = await fetch(
            new Request("https://app.saroh.in/orders?token=secret"),
            {},
            ctx,
        );

        expect(res.status).toBe(500);
        expect(res.headers.get("content-type")).toContain("text/html");
        expect(res.headers.get("cache-control")).toBe("no-store");
        const body = await res.text();
        expect(body).toContain("Something went wrong");
        // The visitor never sees the error.
        expect(body).not.toContain("boom");
        // The log names the path, never the query.
        expect(log).toHaveBeenCalledWith({
            event: "worker_crashed",
            path: "/orders",
            error: "Error: boom",
        });
    });

    it("logs to the console when no logger is given", async () => {
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const fetch = withCrashPage(
            () => {
                // A thrown non-Error, as some libraries do.
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw "not an error";
            },
            { brand: "neutral" },
        );

        const res = await fetch(new Request("https://shop.example/"), {}, ctx);
        expect(res.status).toBe(500);
        expect(spy).toHaveBeenCalledOnce();
    });

    it("sends no body to a HEAD", async () => {
        const fetch = withCrashPage(
            () => {
                throw new Error("boom");
            },
            { brand: "saroh", log: () => undefined },
        );

        const res = await fetch(
            new Request("https://app.saroh.in/", { method: "HEAD" }),
            {},
            ctx,
        );
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("");
    });

    it("hands the error to the tracker without waiting for it (DEC-125)", async () => {
        const error = new Error("boom");
        const waitUntil = vi.fn();
        const env = { KEY: "k" };
        const report = vi.fn(() => new Promise<void>(() => undefined));
        const fetch = withCrashPage(
            () => {
                throw error;
            },
            { brand: "neutral", log: () => undefined, report },
        );
        const request = new Request("https://rye.saroh.app/menu");

        // Resolves although the report never does.
        const res = await fetch(request, env, { waitUntil });

        expect(res.status).toBe(500);
        expect(report).toHaveBeenCalledWith(error, {
            request,
            env,
            ctx: { waitUntil },
        });
        expect(waitUntil).toHaveBeenCalledOnce();
    });

    it("still draws the page when the tracker throws or rejects", async () => {
        for (const report of [
            () => {
                throw new Error("tracker down");
            },
            () => Promise.reject(new Error("tracker down")),
        ]) {
            const fetch = withCrashPage(
                () => {
                    throw new Error("boom");
                },
                { brand: "saroh", log: () => undefined, report },
            );
            const res = await fetch(
                new Request("https://app.saroh.in/"),
                {},
                ctx,
            );
            expect(res.status).toBe(500);
        }
    });
});
