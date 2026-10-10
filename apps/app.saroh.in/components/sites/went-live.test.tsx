import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PrePublishCheck } from "./pre-publish-check";
import { WentLive } from "./went-live";

const noop = vi.fn();

const live = (address: string | null, record: string | null = null) =>
    renderToStaticMarkup(
        <WentLive
            siteName="Flour & Ferment"
            live={{ address, record }}
            onClose={noop}
        />,
    );

describe("the publish check's finished state, the first time a site goes live", () => {
    it("says the site is live and shows its address as a link that opens it", () => {
        const html = live("flour.saroh.app");
        expect(html).toContain("Flour &amp; Ferment is live.");
        expect(html).toContain("Anyone can open it now at");
        expect(html).toMatch(
            /<a[^>]*href="https:\/\/flour\.saroh\.app"[^>]*>flour\.saroh\.app/,
        );
    });

    it("offers one next thing: passing the address on, by link or QR code", () => {
        const html = live("flour.saroh.app");
        expect(html).toContain(
            "Send the address to the people who already know you, or print its QR code for your counter.",
        );
        expect(html).toContain("Share your website");
        expect(html).toContain("QR code for your website");
    });

    it("is announced politely, with no exclamation", () => {
        const html = live("flour.saroh.app");
        expect(html).toContain('role="status"');
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("!");
        expect(html).not.toMatch(/congratulations/i);
        expect(html).toContain("motion-reduce:animate-none");
    });

    it("says what was recorded when it went live without approval", () => {
        expect(
            live("flour.saroh.app", "Recorded as gone live without approval."),
        ).toContain("Recorded as gone live without approval.");
    });

    it("makes up no address for someone who isn't shown one", () => {
        const html = live(null);
        expect(html).toContain("Anyone can open it now.");
        expect(html).not.toContain("https://");
        expect(html).not.toContain("Share your website");
    });

    it("is the check itself, not another surface", () => {
        const html = renderToStaticMarkup(
            <PrePublishCheck
                siteName="Flour & Ferment"
                pages={[]}
                flags={[]}
                awaitingNavigation={[]}
                publishing={false}
                unsaved={false}
                neverPublished={false}
                pendingSummary={null}
                pendingKnown
                review={{
                    openNotes: 0,
                    latestApproval: null,
                    outstanding: false,
                    pending: false,
                    approvalIsStale: false,
                }}
                wentLive={{ address: "flour.saroh.app", record: null }}
                onPublish={noop}
                onClose={noop}
                onJump={noop}
            />,
        );
        expect(html).toContain("Flour &amp; Ferment is live.");
        expect(html).toContain("Back to editing");
        // The publish button has done its work.
        expect(html).not.toContain("Publish changes");
        expect(html).not.toContain("Publish site");
    });
});
