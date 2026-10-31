// The GST page, guide and download templates and their hubs (plan 2026-10-31-002, U7–U9): they compose the shared blocks only, and draw a link only when it is passed.
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
    DownloadPage,
    DownloadsHub,
    GstHub,
    GstPage,
    GuidePage,
    guidesFor,
    GuidesHub,
    NOT_TAX_ADVICE,
} from "./content-pages";
import type { GstPage as GstData, GuidePage as GuideData } from "./docs";
import { embeddedDocs } from "./docs-embedded";
import { unknownClasses } from "./test-classes";

afterEach(cleanup);

const own = (name: string) =>
    readFileSync(join(__dirname, "components", `${name}.css`), "utf8");

const gst = (slug: string) => embeddedDocs.load("gst", slug) as GstData;
const guide = (slug: string) => embeddedDocs.load("guides", slug) as GuideData;
const salon = gst("salon-and-beauty-services");
const [download] = embeddedDocs.list("downloads");
if (!download) throw new Error("no download page");

const hrefs = (root: HTMLElement) =>
    [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

describe("each template draws only shared blocks and its own few rules", () => {
    const cases: [string, ReactElement, string][] = [
        ["GstPage", <GstPage key="g" page={salon} />, own("gst-page")],
        [
            "GuidePage",
            <GuidePage key="u" page={guide("reduce-no-shows")} />,
            own("guide-page"),
        ],
        [
            "DownloadPage",
            <DownloadPage key="d" page={download} />,
            own("download-page"),
        ],
        ["GstHub", <GstHub key="h1" pages={embeddedDocs.list("gst")} />, ""],
        [
            "GuidesHub",
            <GuidesHub key="h2" pages={embeddedDocs.list("guides")} />,
            "",
        ],
        [
            "DownloadsHub",
            <DownloadsHub key="h3" pages={embeddedDocs.list("downloads")} />,
            "",
        ],
    ];

    it.each(cases)(
        "%s: every class is styles.css's or the template's",
        (_, el, extra) => {
            const { container } = render(el);
            expect(unknownClasses(container, extra)).toEqual([]);
        },
    );

    it.each(cases)(
        "%s: links nowhere with no links passed (the admin preview)",
        (_, el) => {
            const { container } = render(el);
            expect(hrefs(container).filter((h) => !h?.startsWith("#"))).toEqual(
                [],
            );
        },
    );

    it.each([
        ["gst-page", "sp-gst-"],
        ["guide-page", "sp-gd-"],
        ["download-page", "sp-dl-"],
    ])("%s.css styles only its own classes", (file, prefix) => {
        const classes =
            own(file)
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .match(/\.[a-z][\w-]*/g) ?? [];
        expect(
            classes.filter((c) => c !== ".sp" && !c.startsWith(`.${prefix}`)),
        ).toEqual([]);
    });
});

describe("GstPage", () => {
    it("draws the salon board: answer, checked line with its source, four facts, the invoice total", () => {
        const { container } = render(
            <GstPage page={salon} links={{ resolve: (h) => h }} />,
        );
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
            salon.h1,
        );
        expect(container.querySelector(".sp-ans")?.textContent).toContain(
            "5% GST, without input tax credit",
        );
        const checked = container.querySelector(".sp-gst-checked");
        expect(checked?.textContent).toMatch(
            /^Checked on 24 Oct 2026 against the CBIC/,
        );
        expect(checked?.querySelector("a")?.getAttribute("href")).toBe(
            salon.sources[0]?.href,
        );
        expect(container.querySelectorAll(".sp-facts-i")).toHaveLength(4);
        expect(container.querySelector(".sp-dt-total")?.textContent).toBe(
            "Total₹2,300.00₹57.50₹57.50₹2,415.00",
        );
        expect(container.querySelectorAll(".sp-nl li")).toHaveLength(3);
        expect(screen.getByText(salon.band?.title ?? "")).toBeTruthy();
    });

    it.each(embeddedDocs.list("gst").map((p) => p.slug))(
        "/gst/%s says it isn't tax advice",
        (slug) => {
            const { container } = render(<GstPage page={gst(slug)} />);
            expect(
                container.querySelector(".sp-by-line")?.textContent,
            ).toContain(NOT_TAX_ADVICE);
        },
    );

    it("draws a GST tool or the /for/ page only when it is passed (live)", () => {
        const { container, rerender } = render(<GstPage page={salon} />);
        expect(container.querySelectorAll(".sp-rel-tool")).toHaveLength(0);
        rerender(
            <GstPage
                page={salon}
                links={{
                    calculator: { href: "/tools/gst-calculator" },
                    forPage: { href: "/for/salons", plural: "salons" },
                }}
            />,
        );
        const tools = [...container.querySelectorAll(".sp-rel-tool")];
        expect(tools.map((t) => t.querySelector("b")?.textContent)).toEqual([
            "GST calculator",
            "Saroh for salons",
        ]);
        expect(tools[0]?.textContent).toContain(
            "Add or take out 5% in a second.",
        );
        expect(hrefs(container)).toEqual([
            "/tools/gst-calculator",
            "/for/salons",
        ]);
    });

    it("a basics page draws its compare table, not a receipt", () => {
        const { container } = render(
            <GstPage page={gst("composition-scheme")} />,
        );
        expect(container.querySelector(".sp-dt-rec")).toBeNull();
        expect(container.querySelector(".sp-dt-desk table")).not.toBeNull();
    });

    it("online courses draws the IGST column beside the in-state split", () => {
        const { container } = render(<GstPage page={gst("online-courses")} />);
        const heads = [
            ...container.querySelectorAll(".sp-dt-desk thead th"),
        ].map((h) => h.textContent);
        expect(heads).toContain("IGST 18%");
        expect(heads).toContain("CGST 9%");
    });

    it("shows three more GST pages in the rail, never one for the same search", () => {
        const items = embeddedDocs
            .list("gst")
            .map((p) => ({ name: p.name, search: p.search }));
        const { container } = render(<GstPage page={salon} related={items} />);
        const links = [...container.querySelectorAll(".sp-rel-link")].map(
            (a) => a.textContent,
        );
        expect(links).toHaveLength(3);
        expect(links).not.toContain(`${salon.name} →`);
    });

    it("falls back to the kind's band without one in the file", () => {
        render(<GstPage page={{ ...salon, band: undefined }} />);
        expect(screen.getByText("GST worked out on every bill.")).toBeTruthy();
    });
});

describe("GuidePage", () => {
    it("links its outline to its own H2s", () => {
        const g = guide("reduce-no-shows");
        const { container } = render(<GuidePage page={g} />);
        const anchors = [...container.querySelectorAll(".sp-otp a")].map((a) =>
            a.getAttribute("href"),
        );
        const ids = [...container.querySelectorAll("h2[id]")].map(
            (h) => `#${h.id}`,
        );
        expect(anchors.length).toBeGreaterThan(0);
        expect(anchors).toEqual(ids);
        expect(container.querySelector(".sp-by")?.textContent).toContain(
            `${g.readMinutes} min read`,
        );
    });

    it("keeps a link to a Help article", () => {
        const { container } = render(
            <GuidePage
                page={guide("reduce-no-shows")}
                links={{ resolve: (h) => h }}
            />,
        );
        expect(hrefs(container)).toContain(
            "/help/take-a-deposit-when-they-book",
        );
    });
});

describe("DownloadPage", () => {
    it("puts the gate beside the title, and nothing there without one", () => {
        const { container, rerender } = render(
            <DownloadPage page={download} />,
        );
        expect(container.querySelector(".sp-cl-aside")).toBeNull();
        expect(container.querySelectorAll(".sp-dl-ben li")).toHaveLength(
            download.benefits.length,
        );
        rerender(
            <DownloadPage
                page={download}
                gate={<form aria-label="Get the files" />}
            />,
        );
        expect(
            within(screen.getByRole("complementary")).getByRole("form"),
        ).toBeTruthy();
        expect(container.querySelector(".sp-by-line")?.textContent).toMatch(
            /^Made by/,
        );
    });
});

describe("hubs", () => {
    it("GST: By trade first, then The basics", () => {
        render(<GstHub pages={embeddedDocs.list("gst")} />);
        expect(
            screen
                .getAllByRole("heading", { level: 2 })
                .map((h) => h.textContent)
                .slice(0, 2),
        ).toEqual(["By trade", "The basics"]);
        expect(
            screen.getByText("GST on salon and beauty services"),
        ).toBeTruthy();
    });

    it("orders trades as the list board: salons first", () => {
        const { container } = render(
            <GstHub pages={embeddedDocs.list("gst")} />,
        );
        expect(container.querySelector(".sp-lc-t")?.textContent).toBe(
            "GST on salon and beauty services",
        );
    });

    it("guides: the first written first", () => {
        const { container } = render(
            <GuidesHub pages={embeddedDocs.list("guides")} />,
        );
        expect(container.querySelector(".sp-lc-t")?.textContent).toBe(
            "How to reduce no-shows at your salon or clinic",
        );
    });

    it("lists only the pages it is given", () => {
        const { container } = render(<GstHub pages={[salon]} />);
        expect(container.querySelectorAll(".sp-lc")).toHaveLength(1);
    });

    it("downloads: the format over the name, and the corrected lead", () => {
        const { container } = render(
            <DownloadsHub pages={embeddedDocs.list("downloads")} />,
        );
        const eyes = [...container.querySelectorAll(".sp-lc-eye")].map(
            (e) => e.textContent,
        );
        expect(eyes).toContain("Excel · Word");
        expect(eyes).toContain("Excel · CSV");
        expect(screen.getByText(/Free, no account needed\./)).toBeTruthy();
    });
});

describe("guides' trade chips", () => {
    const pages = [
        {
            slug: "a",
            h1: "A",
            line: "a",
            group: "G",
            trades: ["salons" as const],
            readMinutes: 3,
            published: "2026-10-24",
        },
        {
            slug: "b",
            h1: "B",
            line: "b",
            group: "G",
            trades: ["gyms-and-studios" as const],
            readMinutes: 3,
            published: "2026-10-24",
        },
        {
            slug: "c",
            h1: "C",
            line: "c",
            group: "G",
            trades: [],
            readMinutes: 3,
            published: "2026-10-24",
        },
    ];

    it("filters by ?for=, All shows every one, an unknown value is All", () => {
        expect(
            guidesFor(pages, "gyms-and-studios").pages.map((p) => p.slug),
        ).toEqual(["b"]);
        expect(guidesFor(pages, null).pages).toHaveLength(3);
        expect(guidesFor(pages, "plumbers")).toEqual({ trade: null, pages });
    });

    it("a guide tagged with no trade shows under All only", () => {
        for (const t of ["salons", "gyms-and-studios", "clinics", "shops"])
            expect(guidesFor(pages, t).pages.map((p) => p.slug)).not.toContain(
                "c",
            );
    });

    it("chips are links, the chosen one aria-current", () => {
        render(
            <GuidesHub
                pages={pages}
                trade="salons"
                links={{ hub: "/guides" }}
            />,
        );
        const nav = screen.getByRole("navigation", {
            name: "Guides for your trade",
        });
        const current = within(nav).getByRole("link", { current: "page" });
        expect(current.textContent).toBe("Salons");
        expect(current.getAttribute("href")).toBe("/guides?for=salons");
        expect(
            within(nav).getByRole("link", { name: "All" }).getAttribute("href"),
        ).toBe("/guides");
        expect(screen.queryByText("B")).toBeNull();
    });
});
