import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { TopBarActionProps } from "@/components/sites/editor/top-bar-actions";
import { TopBarActions } from "@/components/sites/editor/top-bar-actions";
import { ReleaseRow } from "@/components/sites/test-releases/release-row";
import type { ReleaseAbilities, TestRelease } from "@/lib/sites/test-releases";
import {
    NEEDS_APPROVAL_OTHERS,
    NEEDS_PUBLISH_PERMISSION,
} from "@/lib/sites/test-releases";

import { PanelDivider } from "./editor-chrome";

// Server-only: the row's actions reach the API client. Nothing here calls it.
vi.mock("@/lib/sites/test-releases-actions", () => ({
    cancelScheduledGoLive: vi.fn(),
    createTestReleaseLink: vi.fn(),
    discardTestRelease: vi.fn(),
    openTestRelease: vi.fn(),
    revokeTestReleaseLink: vi.fn(),
}));

/**
 * The divider is a cell of the editor's grid: the narrow layout counts a 1px
 * column for it. Hidden below a breakpoint, the page slid into that column
 * and drew blank on a phone turned on its side (G4).
 */
describe("PanelDivider", () => {
    it("keeps its grid cell at every width", () => {
        const html = renderToStaticMarkup(
            <PanelDivider
                label="Resize the block list"
                width={232}
                min={180}
                max={360}
                reset={232}
                onResize={() => undefined}
                onNudge={() => undefined}
            />,
        );
        const cls =
            /role="separator"[^>]*class="([^"]*)"/.exec(html)?.[1] ??
            /class="([^"]*)"[^>]*role="separator"/.exec(html)?.[1];
        expect(cls).toBeTruthy();
        expect(cls?.split(/\s+/)).not.toContain("hidden");
    });
});

const release: TestRelease = {
    id: "rel_1",
    number: 2,
    name: "Diwali menu",
    note: null,
    status: "ready",
    createdAt: "2026-09-30T04:40:00Z",
    createdBy: { name: "Asha" },
    draftChangedSince: true,
    standing: {
        outstanding: false,
        route: "NONE",
        approved: false,
        latest: null,
    },
    schedule: null,
    wentLiveAt: null,
    livePublicationId: null,
    discardedAt: null,
    lastGoLive: null,
    links: [],
};

const can: ReleaseAbilities = {
    canPublish: true,
    canUpdate: true,
    needsApproval: false,
    canOverride: false,
};

function row(over: Partial<ReleaseAbilities>) {
    return renderToStaticMarkup(
        <ReleaseRow
            siteId="site_1"
            release={release}
            zone="Asia/Kolkata"
            can={{ ...can, ...over }}
            onChanged={() => undefined}
            onGoLive={() => undefined}
        />,
    );
}

/** The `disabled` attribute of the button whose text starts with `label`. */
function disabled(html: string, label: string): boolean {
    const button = new RegExp(
        `<button([^>]*)>(?:(?!</button>).)*${label}`,
    ).exec(html);
    expect(button, `a ${label} button`).toBeTruthy();
    return /\sdisabled=""/.test(button?.[1] ?? "");
}

/** A test release in the editor's panel (DEC-071, T11). */
describe("ReleaseRow", () => {
    it("without site:publish, Go live and Schedule are off and say why", () => {
        const html = row({ canPublish: false });
        expect(disabled(html, "Go live…")).toBe(true);
        expect(disabled(html, "Schedule…")).toBe(true);
        expect(html).toContain(NEEDS_PUBLISH_PERMISSION);
    });

    it("with site:publish, Go live is on", () => {
        const html = row({});
        expect(disabled(html, "Go live…")).toBe(false);
        expect(html).toContain("Your draft has changed since");
        expect(html).toContain("Not reviewed yet");
    });

    it("with approval needed, an admin waits and an owner is told it's recorded", () => {
        const admin = row({ needsApproval: true });
        expect(disabled(admin, "Go live…")).toBe(true);
        expect(admin).toContain(NEEDS_APPROVAL_OTHERS);

        const owner = row({ needsApproval: true, canOverride: true });
        expect(disabled(owner, "Go live…")).toBe(false);
        expect(owner).toContain("go live without approval; it&#x27;s recorded");
    });
});

const bar: TopBarActionProps = {
    device: "desktop",
    setDevice: () => undefined,
    zoom: "fit",
    setZoom: () => undefined,
    previewing: false,
    setPreviewing: () => undefined,
    asking: false,
    inReview: false,
    askForReview: () => undefined,
    withdrawReview: () => undefined,
    onSharePreview: () => undefined,
    publishing: false,
    publishDisabled: false,
    publishHint: undefined,
    flagCount: 0,
    onPublish: () => undefined,
    openNotes: 0,
};

describe("TopBarActions with test releases", () => {
    it("draws the Test release split only while they are on", () => {
        expect(renderToStaticMarkup(<TopBarActions {...bar} />)).not.toContain(
            "Test release",
        );
        const html = renderToStaticMarkup(
            <TopBarActions
                {...bar}
                testRelease={{
                    onMake: () => undefined,
                    onOpenList: () => undefined,
                    count: 1,
                }}
            />,
        );
        expect(html).toContain("Test release");
        expect(html).toContain('aria-label="More test release actions"');
    });

    it("Publish reads Needs approval, and only an owner can press it", () => {
        const others = renderToStaticMarkup(
            <TopBarActions {...bar} needsApproval />,
        );
        expect(disabled(others, "Needs approval")).toBe(true);
        const owner = renderToStaticMarkup(
            <TopBarActions {...bar} needsApproval canOverride />,
        );
        expect(disabled(owner, "Needs approval")).toBe(false);
    });
});

describe("TopBarActions (UX-081, UX-035, UX-068)", () => {
    it("marks things worth a look with a dot, not a count that reads as changes", () => {
        const html = renderToStaticMarkup(
            <TopBarActions {...bar} flagCount={3} />,
        );
        expect(html).toContain("data-flag-dot");
        expect(html).not.toMatch(/>3</);
    });

    it("folds Preview, Feedback and Test release into More when narrow", () => {
        const html = renderToStaticMarkup(
            <TopBarActions
                {...bar}
                compact
                onFeedback={() => undefined}
                testRelease={{ onOpenList: () => undefined, count: 0 }}
            />,
        );
        expect(html).toContain("More: preview, feedback and test releases");
        expect(html).not.toContain(">Preview<");
        expect(html).not.toContain("Test release");
        expect(html).toContain("Publish");
        expect(html).toContain("Share");
    });
});
