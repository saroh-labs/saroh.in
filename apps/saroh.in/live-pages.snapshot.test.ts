import { listSearchPages } from "@saroh/search-pages";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The live /for/ and /tools/ pages, pinned (plan 2026-10-31-002 R12).
 *
 * Every page and both hubs are drawn as saroh.in shows them with every page
 * live, at a fixed moment, and the HTML (JSON-LD included) and metadata are
 * held to the files in `__snapshots__/live-pages/`. Work on other page
 * groups must leave these byte for byte. A change meant for these pages
 * updates the files with `vitest run -u`, and the diff shows what moved.
 */
const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

const forPages = listSearchPages({ kind: "for" });
const tools = listSearchPages({ kind: "tools" });

beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T06:30:00Z"));
    env.SAROH_SEARCH_PAGES = JSON.stringify({
        preview: false,
        live: [...forPages, ...tools].map((p) => p.path),
        takenOff: [],
    });
});

interface Route {
    default: (props: never) => ReactElement | Promise<ReactElement>;
    generateMetadata?: (props: never) => unknown;
    metadata?: unknown;
}

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

/** One page's metadata and HTML, as the snapshot file holds it. */
async function drawn(route: Route, props: object = {}): Promise<string> {
    const meta =
        route.metadata ?? (await route.generateMetadata?.(props as never));
    const html = renderToStaticMarkup(await route.default(props as never));
    return `${JSON.stringify(meta, null, 2)}\n\n${html.replace(/></g, ">\n<")}\n`;
}

const file = (name: string) => `./__snapshots__/live-pages/${name}.html`;

describe("live /for/ pages", () => {
    it("has pages to pin", () => {
        expect(forPages.length).toBeGreaterThan(0);
    });

    it("/for hub", async () => {
        await expect(
            await drawn(await import("./app/(site)/for/page")),
        ).toMatchFileSnapshot(file("for"));
    });

    it.each(forPages.map((p) => p.slug))("/for/%s", async (s) => {
        await expect(
            await drawn(await import("./app/(site)/for/[slug]/page"), slug(s)),
        ).toMatchFileSnapshot(file(`for-${s}`));
    });
});

describe("live /tools/ pages", () => {
    it("/tools hub", async () => {
        await expect(
            await drawn(await import("./app/(site)/tools/page")),
        ).toMatchFileSnapshot(file("tools"));
    });

    it("has the app tools' own routes", () => {
        expect(
            tools
                .filter((t) => t.inApp)
                .map((t) => t.slug)
                .sort(),
        ).toEqual(["link-preview", "qr-code-maker"]);
    });

    it.each(tools.map((t) => t.slug))("/tools/%s", async (s) => {
        // The two app tools have their own routes (`tools/[slug]` skips them).
        const own: Partial<Record<string, () => Promise<Route>>> = {
            "qr-code-maker": () =>
                import("./app/(site)/tools/qr-code-maker/page"),
            "link-preview": () =>
                import("./app/(site)/tools/link-preview/page"),
        };
        const ownRoute = own[s];
        const html = ownRoute
            ? await drawn(await ownRoute())
            : await drawn(
                  await import("./app/(site)/tools/[slug]/page"),
                  slug(s),
              );
        await expect(html).toMatchFileSnapshot(file(`tools-${s}`));
    });
});
