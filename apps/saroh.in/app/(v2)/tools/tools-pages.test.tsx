// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toolGateSubmit } from "@/components/v2/tools/tool-gate";

/**
 * The free tools on saroh.in (#1253) on a preview build (no publish list):
 * every package tool built as a draft and `noindex`, the hub listing them
 * with the app's two, and the email gate sending the email alone to the QR
 * code maker's unlock route.
 */
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/tools",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

describe("/tools/[slug]", () => {
    it("builds the package's tools, never the two with their own routes", async () => {
        const { generateStaticParams } = await import("./[slug]/page");
        const slugs = generateStaticParams().map((p) => p.slug);
        expect(slugs).toContain("no-show-cost-calculator");
        expect(slugs).not.toContain("qr-code-maker");
        expect(slugs).not.toContain("link-preview");
    });

    it("draws a tool not live as a draft, kept out of search", async () => {
        const route = await import("./[slug]/page");
        const meta = await route.generateMetadata(
            slug("no-show-cost-calculator"),
        );
        expect(meta.robots).toEqual({ index: false, follow: false });
        expect(meta.title).toBe(
            "No-show cost calculator: what missed bookings cost · Saroh",
        );
        render(await route.default(slug("no-show-cost-calculator")));
        expect(screen.getByText("Draft — not published yet")).toBeTruthy();
        await expect(route.default(slug("qr-code-maker"))).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
    });

    it("sends the gate's email and the tool's slug, and nothing the visitor typed, to the unlock route", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(
                new Response(
                    JSON.stringify({ unlocked: true, emailed: "sent" }),
                ),
            );
        vi.stubGlobal("fetch", fetcher);
        const route = await import("./[slug]/page");
        render(await route.default(slug("no-show-cost-calculator")));
        await screen.findByRole("form", { name: "Your bookings" });
        for (const [label, value] of [
            ["Bookings a week", "60"],
            ["How many don't turn up", "8"],
            ["Average booking", "900"],
            ["Get this working as a PDF", "ryestudio@example.com"],
        ])
            fireEvent.change(screen.getByLabelText(label), {
                target: { value },
            });
        expect(
            screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
        ).toBe("/privacy");
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/tools/unlock");
        expect(JSON.parse(init.body as string)).toEqual({
            email: "ryestudio@example.com",
            tool: "no-show-cost-calculator",
        });
        expect(
            screen.getByRole("button", { name: "Print or save as PDF" }),
        ).toBeTruthy();
    });

    it("reads the unlock route's refusals as the gate's", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        unlocked: false,
                        failure: "rate-limited",
                    }),
                ),
            ),
        );
        expect(await toolGateSubmit("a@example.com", "gst-calculator")).toEqual(
            {
                ok: false,
                reason: "rate-limited",
            },
        );
    });
});

describe("/tools", () => {
    it("lists every tool this build has in its section, the app's two among them", async () => {
        const { default: Hub } = await import("./page");
        render(Hub());
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        const qr = screen
            .getByRole("heading", { name: "QR codes" })
            .closest("section");
        if (!qr) throw new Error("no QR codes section");
        expect(
            within(qr)
                .getByRole("link", { name: /QR code maker/ })
                .getAttribute("href"),
        ).toBe("/tools/qr-code-maker");
        expect(
            screen
                .getByRole("link", { name: /No-show cost calculator/ })
                .getAttribute("href"),
        ).toBe("/tools/no-show-cost-calculator");
    });
});
