import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { pendingAreas } from "@/lib/sites/pending";
import type { Flag, SitePage } from "@/lib/sites/service";
import { publishWaitsFor } from "./pre-publish-words";
import {
    GoingLive,
    PublishFlags,
    WEB_ADDRESS_SETTINGS_HREF,
} from "./publish-list";
import { PublishLiveBody } from "./publish-live";

vi.mock("@/lib/organizations/web-address-actions", () => ({
    checkWebAddress: vi.fn(),
    saveWebAddress: vi.fn(),
}));

const noop = vi.fn();
const about: SitePage = {
    id: "about",
    title: "About",
    path: "/about",
} as SitePage;

const noAddress: Flag = {
    type: "addressMissing",
    message:
        "Choose a web address before publishing. Without one, nobody can reach this site.",
    pageId: null,
    sectionIndex: null,
    field: "subdomain",
    blocking: true,
};
const noDescription: Flag = {
    type: "missingSeoDescription",
    message: "Search results show the first lines of the page instead.",
    pageId: "about",
    sectionIndex: null,
    field: "seoDescription",
};
const noImage: Flag = {
    type: "missingImage",
    message: "Gallery",
    pageId: "about",
    sectionIndex: 2,
    field: "images",
};

const flags = (
    list: Flag[],
    canChange = true,
    fixedHost: string | null = null,
) =>
    renderToStaticMarkup(
        <PublishFlags
            flags={list}
            pages={[about]}
            addressFix={{
                address: "northwind",
                platformOrigin: "https://northwind.saroh.app",
                canChange,
            }}
            fixedHost={fixedHost}
            onAddressSaved={noop}
            onJump={noop}
        />,
    );

describe("the Publish sheet's list (DEC-185)", () => {
    it("puts a blocker first, in red, with its fix, and marks advice as not stopping you", () => {
        const html = flags([noDescription, noAddress]);
        expect(html.indexOf("Fix first · 1")).toBeLessThan(
            html.indexOf("Worth a look · 1 · won’t stop you"),
        );
        expect(html).toContain('data-flag-tone="block"');
        expect(html).toContain("Choose address");
        // With a blocker, the "won't stop you" line is in the heading only.
        expect(html).not.toContain("It won’t stop you publishing.");
    });

    it("names each advice with its page and its fix", () => {
        const html = flags([noDescription]);
        expect(html).toContain("1 thing worth a look");
        expect(html).toContain("No search description");
        expect(html).toContain(
            "About · Search results show the first lines of the page instead.",
        );
        expect(html).toContain("Add one");
        expect(html).toContain("It won’t stop you publishing.");
        expect(flags([noDescription, noImage])).toContain(
            "None of these stop you publishing.",
        );
    });

    it("sends someone who can't choose the address to Settings › Business", () => {
        expect(flags([noAddress], false)).toContain(
            `href="${WEB_ADDRESS_SETTINGS_HREF}"`,
        );
        expect(flags([noAddress], true)).not.toContain(
            WEB_ADDRESS_SETTINGS_HREF,
        );
    });

    it("says Fixed once the address is saved here, before the flags are read again", () => {
        const html = flags([noAddress], true, "northwind.saroh.app");
        expect(html).not.toContain("Fix first");
        expect(html).toContain("Web address set");
        expect(html).toContain("northwind.saroh.app");
    });

    it("says everything checks out when there is nothing", () => {
        expect(flags([])).toContain("Everything checks out.");
    });
});

describe("why Publish waits", () => {
    it("is the web address in today's words, else the blocker, else saving", () => {
        expect(publishWaitsFor({ blockers: [noAddress], unsaved: false })).toBe(
            "Choose a web address first",
        );
        expect(
            publishWaitsFor({
                blockers: [{ type: "placeholderText" }],
                unsaved: false,
            }),
        ).toBe("Fix what's marked first");
        expect(publishWaitsFor({ blockers: [], unsaved: true })).toContain(
            "Saving your changes",
        );
        expect(publishWaitsFor({ blockers: [], unsaved: false })).toBeNull();
    });
});

describe("what goes live", () => {
    const going = (sections: number | null, site: string[] | null) =>
        renderToStaticMarkup(
            <GoingLive
                neverPublished={false}
                pendingKnown
                pendingSummary={sections || site?.length ? "summary" : null}
                pendingChanges={sections}
                pendingSiteChanges={site}
            />,
        );

    it("is one sentence for one area, and one row per area for several", () => {
        const one = renderToStaticMarkup(
            <GoingLive
                neverPublished={false}
                pendingKnown
                pendingSummary="the style"
                pendingChanges={0}
                pendingSiteChanges={["style"]}
            />,
        );
        expect(one).toContain("the style (look, colours and type)");
        const many = going(2, ["style", "menu"]);
        expect(many).toContain("Going live · 3 changes");
        expect(many).toContain("2 blocks changed");
    });

    it("rows each area the server counted, and leaves out unknown kinds", () => {
        expect(pendingAreas(1, ["footer", "nonsense"])).toEqual([
            { area: "Blocks", detail: "1 block changed" },
            { area: "Footer", detail: "Changed" },
        ]);
    });
});

describe("the result", () => {
    it("says the site is live, with the address to copy and the record", () => {
        const html = renderToStaticMarkup(
            <PublishLiveBody
                live={{
                    siteName: "Northwind Supply",
                    address: "northwind.saroh.app",
                    record: "Recorded as gone live without approval.",
                }}
            />,
        );
        expect(html).toContain("Northwind Supply is live");
        expect(html).toContain("Anyone can open it now.");
        expect(html).toContain("Copy address");
        expect(html).toContain("Recorded as gone live without approval.");
        expect(html).toContain('role="status"');
    });

    it("makes up no address for someone who isn't shown one", () => {
        const html = renderToStaticMarkup(
            <PublishLiveBody
                live={{ siteName: "Rye", address: null, record: null }}
            />,
        );
        expect(html).not.toContain("Copy address");
    });
});
