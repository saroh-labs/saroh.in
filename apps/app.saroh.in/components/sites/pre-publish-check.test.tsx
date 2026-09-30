import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Flag, ReviewState } from "@/lib/sites/service";

import {
    PrePublishCheck,
    WEB_ADDRESS_SETTINGS_HREF,
} from "./pre-publish-check";

const review: ReviewState = {
    openNotes: 0,
    latestApproval: null,
    outstanding: false,
    pending: false,
    approvalIsStale: false,
};

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
    message: "This site has no search description.",
    pageId: null,
    sectionIndex: null,
    field: "seoDescription",
};

const check = (flags: Flag[]) =>
    renderToStaticMarkup(
        <PrePublishCheck
            siteName="Rye"
            pages={[]}
            flags={flags}
            awaitingNavigation={[]}
            publishing={false}
            unsaved={false}
            neverPublished
            pendingSummary={null}
            pendingKnown
            review={review}
            onPublish={() => {}}
            onClose={() => {}}
            onJump={() => {}}
        />,
    );

/** The publish button's opening tag. */
const publishButton = (html: string) =>
    html.match(/<button[^>]*>Publish site<\/button>/)?.[0] ?? "";

describe("PrePublishCheck: a site with no web address (L5)", () => {
    it("holds Publish and sends the merchant to choose an address", () => {
        const html = check([noAddress, noDescription]);
        expect(publishButton(html)).toContain(`disabled=""`);
        expect(publishButton(html)).toContain("Choose a web address first");
        expect(html).toContain(`href="${WEB_ADDRESS_SETTINGS_HREF}"`);
        expect(html).toContain("No web address");
        expect(html).toContain("Choose one in Settings › Business");
    });

    it("leaves Publish live for advisory flags", () => {
        const html = check([noDescription]);
        expect(publishButton(html)).not.toBe("");
        expect(publishButton(html)).not.toContain(`disabled=""`);
        expect(html).not.toContain(WEB_ADDRESS_SETTINGS_HREF);
    });
});
