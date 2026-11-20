import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RESTORE_NEEDS_OWNER } from "@/lib/sites/release-review";
import type { SitePublication } from "@/lib/sites/service";

import { SiteVersions } from "./site-versions";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// Server-only: nothing here calls them.
vi.mock("@/lib/sites/actions", () => ({
    restorePublication: vi.fn(),
    createApproval: vi.fn(),
    requestReview: vi.fn(),
    setCommentResolved: vi.fn(),
    listPreviewLinks: vi.fn(),
    createPreviewLink: vi.fn(),
    revokePreviewLink: vi.fn(),
}));

/**
 * Today's version history while the Website area is off (owner, 20 Nov
 * 2026): Restore puts a version live again, with its old words and gate.
 */

const version = (over: Partial<SitePublication>): SitePublication => ({
    id: "pub_1",
    publishedAt: "2026-09-30T10:40:00Z",
    publishedByUserId: "user_asha",
    publishedBy: "Asha",
    templateId: "starter",
    templateVersion: 1,
    isCurrent: false,
    bypass: null,
    override: null,
    reviewRoute: "NONE",
    testRelease: null,
    ...over,
});

const history: SitePublication[] = [
    version({
        id: "pub_live",
        isCurrent: true,
        reviewRoute: "OVERRIDDEN",
        override: { at: "2026-09-30T10:40:00Z", by: "Asha" },
        testRelease: { id: "rel_2", number: 2, name: "Diwali menu" },
    }),
    version({
        id: "pub_bypass",
        reviewRoute: "BYPASSED",
        bypass: { at: "2026-09-29T10:40:00Z", by: "Ravi" },
    }),
    version({ id: "pub_approved", reviewRoute: "APPROVED" }),
    version({ id: "pub_none" }),
];

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ");

function render(
    over: Partial<Parameters<typeof SiteVersions>[0]> = {},
): string {
    return renderToStaticMarkup(
        <SiteVersions
            siteId="site_1"
            publications={history}
            changesRequested={false}
            canRestore
            {...over}
        />,
    );
}

describe("today's restore (Website area off)", () => {
    it("offers Restore that goes live, never as the draft", () => {
        const out = text(render());
        expect(out.match(/Restore/g)).toHaveLength(3);
        expect(out).not.toContain("as the draft");
        expect(text(render({ canRestore: false }))).not.toContain("Restore");
    });

    it("keeps Restore for an owner, and says why it's off for anyone else, while approval is needed", () => {
        const owner = text(render({ needsApproval: true, canOverride: true }));
        expect(owner).toContain("Restore");
        expect(owner).not.toContain(RESTORE_NEEDS_OWNER);

        const admin = render({ needsApproval: true, canOverride: false });
        expect(text(admin)).toContain(RESTORE_NEEDS_OWNER);
        expect(admin).toMatch(/<button[^>]*disabled[^>]*>Restore<\/button>/);

        // Off: as before.
        expect(text(render())).not.toContain(RESTORE_NEEDS_OWNER);
    });
});
