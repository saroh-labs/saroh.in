import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PublishRequestView } from "@/lib/sites/publish-requests";
import { stateOf } from "@/lib/sites/publish-requests";
import { PublishRequestScreen } from "./publish-request-screen";

/**
 * The publish request screen's states (DEC-215 as amended 12 Nov 2026):
 * open with both answers, each closed state in its own words, and a refusal
 * the API names moving the screen to that state.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/sites/publish-requests-actions", () => ({
    confirmPublishRequest: vi.fn(),
    declinePublishRequest: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => ({ createPreviewLink: vi.fn() }));

const open: PublishRequestView = {
    siteId: "site-1",
    siteName: "Rye Bakery",
    app: "Claude",
    connectedBy: "Asha",
    requestedAt: "2026-11-12T10:00:00.000Z",
    expiresAt: "2026-11-13T10:00:00.000Z",
    status: "open",
    will: "go_live",
    draftChanged: false,
    neverPublished: true,
    pendingChanges: null,
    pendingSiteChanges: null,
    decidedBy: null,
    decidedAt: null,
    liveUrl: null,
};

const html = (view: PublishRequestView) =>
    renderToStaticMarkup(<PublishRequestScreen view={view} requestId="tok" />);

describe("publish request screen", () => {
    it("shows who asked, the site, what goes live, a preview and both answers", () => {
        const out = html(open);
        expect(out).toContain('data-publish-request="open"');
        expect(out).toContain(
            "Claude prepared this, on Asha&#x27;s connection.",
        );
        expect(out).toContain("Rye Bakery");
        expect(out).toContain("Open the preview");
        expect(out).toContain("Publishing puts it live for everyone");
        expect(out).toContain(">Publish<");
        expect(out).toContain("Don&#x27;t publish");
    });

    it("offers Send for approval when the site needs a reviewer", () => {
        const out = html({ ...open, will: "go_to_reviewers" });
        expect(out).toContain("Send for approval");
        expect(out).toContain("reviewer&#x27;s approval");
    });

    it("says an expired request and a changed draft in their own words, with no buttons", () => {
        const expired = html({ ...open, status: "expired" });
        expect(expired).toContain('data-publish-request="expired"');
        expect(expired).toContain("Ask the app to prepare it again.");
        expect(expired).not.toContain("Don&#x27;t publish");

        const changed = html({ ...open, draftChanged: true });
        expect(changed).toContain('data-publish-request="draftChanged"');
        expect(changed).toContain(
            "The website changed since Claude prepared this",
        );
    });

    it("says who already answered it", () => {
        const out = html({ ...open, status: "published", decidedBy: "Meera" });
        expect(out).toContain('data-publish-request="used"');
        expect(out).toContain("Meera already published this.");
    });

    it("moves to the state a refusal names, and to the result an answer gives", () => {
        expect(stateOf(open, null, "PUBLISH_REQUEST_EXPIRED")).toBe("expired");
        expect(stateOf(open, null, "PUBLISH_REQUEST_USED")).toBe("used");
        expect(stateOf(open, null, "DRAFT_CHANGED")).toBe("draftChanged");
        expect(stateOf(open, null, "SOMETHING_ELSE")).toBe("open");
        expect(
            stateOf(open, { outcome: "published", liveUrl: null }, null),
        ).toBe("published");
        expect(
            stateOf(
                open,
                { outcome: "sent_for_approval", liveUrl: null },
                null,
            ),
        ).toBe("sentForApproval");
        expect(
            stateOf(open, { outcome: "declined", liveUrl: null }, null),
        ).toBe("declined");
    });
});
