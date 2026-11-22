import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { siteGroups } from "./group-map";
import { SitePhoneNav, SiteSectionList } from "./section-list";
import { SiteHeader } from "./site-header";

let path = "/sites/s1/pages";
vi.mock("next/navigation", () => ({
    usePathname: () => path,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const groups = siteGroups("s1", {
    canEdit: true,
    mayReadForms: true,
    mayBusiness: true,
    mayTeam: true,
});

describe("the desk's section list", () => {
    it("draws Overview and the four groups, the open screen's group open", () => {
        path = "/sites/s1/pages";
        const html = renderToStaticMarkup(
            <SiteSectionList siteId="s1" groups={groups} />,
        );
        expect(html).toContain('href="/sites/s1/overview"');
        for (const label of [
            "Pages and posts",
            "Look",
            "Reach",
            "People and settings",
        ]) {
            expect(html).toContain(label);
        }
        expect(html).toMatch(/aria-current="page"[^>]*>.*Pages</);
        expect(html).toContain('href="/sites/s1/writing"');
        // Closed groups hold their rows back until opened.
        expect(html).not.toContain("Your own web address");
    });

    it("on a phone, offers the way back to the site home", () => {
        path = "/sites/s1/writing";
        const html = renderToStaticMarkup(
            <SitePhoneNav siteId="s1" groups={groups} />,
        );
        expect(html).toContain("Site home");
        path = "/sites/s1/overview";
        expect(
            renderToStaticMarkup(<SitePhoneNav siteId="s1" groups={groups} />),
        ).toBe("");
    });
});

describe("the site header keeps today's controls (00-universal §15)", () => {
    const site = {
        id: "s1",
        name: "Gulmohar",
        host: "gulmohar.saroh.app",
        status: {
            label: "Live · 2 changes waiting",
            tone: "attention" as const,
        },
        paused: true,
    };
    const header = (canEdit: boolean) =>
        renderToStaticMarkup(
            <SiteHeader
                site={site}
                sites={[site]}
                address="gulmohar.saroh.app"
                liveUrl="https://gulmohar.saroh.app"
                qrUrl="https://gulmohar.saroh.app"
                canEdit={canEdit}
                mayCreate
                askAi
            />,
        );

    it("address link, Copy, QR, status, Paused, Open editor and Ask AI", () => {
        const html = header(true);
        expect(html).toContain('href="https://gulmohar.saroh.app"');
        expect(html).toContain(">Copy<");
        expect(html).toContain("QR code for your website");
        expect(html).toContain("Live · 2 changes waiting");
        expect(html).toContain("Paused");
        expect(html).toContain("Open editor");
        expect(html).toContain("Ask AI");
        expect(html).not.toContain("Read only");
    });

    it("says Read only to someone who reads the site (DEC-200)", () => {
        expect(header(false)).toContain("Read only");
    });

    it("opens Publish from the status chip for whoever may publish; a Reviewer's is a badge (U11)", () => {
        expect(header(false)).not.toContain("data-status-chip");
        const html = renderToStaticMarkup(
            <SiteHeader
                site={site}
                sites={[site]}
                address="gulmohar.saroh.app"
                liveUrl="https://gulmohar.saroh.app"
                qrUrl="https://gulmohar.saroh.app"
                canEdit
                mayCreate
                askAi
                publish={{
                    siteId: "s1",
                    siteName: "Gulmohar",
                    host: "gulmohar.saroh.app",
                    pages: [],
                    neverPublished: false,
                    pendingSectionChanges: 2,
                    pendingSiteChanges: [],
                    needsApproval: false,
                    canOverride: false,
                    addressFix: null,
                }}
            />,
        );
        expect(html).toContain("data-status-chip");
        expect(html).toContain("Live · 2 changes waiting: open Publish");
    });
});
