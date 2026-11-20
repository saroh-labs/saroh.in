// @vitest-environment jsdom
/**
 * The Publish sheet's changes (plan 2026-11-18-001 U11, WXMPublish): by
 * person with Leave out, "Publish 4 of 5 changes now", a teammate's change
 * waiting for approval, a failed publish keeping the choices, the count
 * left out afterwards and Tell people.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withDependants } from "@/lib/sites/leave-out";
import type { ChangeUnit, SiteChanges } from "@/lib/sites/service";
import { PublishSheet } from "./publish-sheet";
import type { PublishChanges } from "./use-publish-changes";

vi.mock("@/lib/sites/actions", () => ({ describePhoto: vi.fn() }));
vi.mock("@/lib/moments/actions", () => ({ markMomentSeen: vi.fn() }));
vi.mock("@/lib/sites/changes-read", () => ({ readSiteChanges: vi.fn() }));
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: vi.fn(() => new Promise(() => undefined)),
    makeQrPanelCode: vi.fn(),
}));
vi.mock("@/lib/organizations/web-address-actions", () => ({
    checkWebAddress: vi.fn(),
    saveWebAddress: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
// The sheet primitives need a real browser; what is pinned is the content.
vi.mock("@saroh/ui/sheet", () => ({
    Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
        open ? <div>{children}</div> : null,
    SheetContent: ({ children }: { children: ReactNode }) => (
        <div role="dialog">{children}</div>
    ),
    SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    SheetClose: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@saroh/ui/form-sheet", () => ({
    FormSheet: ({
        open,
        title,
        description,
    }: {
        open: boolean;
        title: string;
        description: ReactNode;
    }) =>
        open ? (
            <div role="dialog" aria-label={title}>
                <p>{description}</p>
            </div>
        ) : null,
}));

const unit = (key: string, over: Partial<ChangeUnit> = {}): ChangeUnit => ({
    key,
    kind: "section",
    change: "changed",
    label: `Changed · ${key}`,
    where: "Bridal makeup packages",
    pageId: "bridal",
    fingerprint: key,
    editedBy: "u1",
    editedAt: "2026-11-15T06:00:00Z",
    requires: [],
    approval: { state: "not-needed", voided: false, approvers: [] },
    ...over,
});

const KAVYA = { id: "k", name: "Kavya", role: "REVIEWER" as const };
const units = [
    unit("a"),
    unit("b"),
    unit("c"),
    unit("d"),
    unit("site:style", {
        kind: "site",
        label: "Colours and headings",
        editedBy: "u2",
        approval: { state: "waiting", voided: false, approvers: [KAVYA] },
    }),
];
const list: SiteChanges = {
    siteId: "s1",
    livePublishedAt: "2026-11-09T06:00:00Z",
    count: units.length,
    units,
    groups: [
        {
            userId: "u1",
            name: "Mohit Mehta",
            you: true,
            units: ["a", "b", "c", "d"],
        },
        {
            userId: "u2",
            name: "Ritika Sharma",
            you: false,
            units: ["site:style"],
        },
    ],
    posts: [
        {
            id: "p1",
            title: "Monsoon hair care",
            updatedAt: "2026-11-16T06:00:00Z",
        },
    ],
    approvalRequired: true,
};
const changes = (out: string[]): PublishChanges => ({
    changes: list,
    read: "ready",
    load: vi.fn(),
    leftOut: withDependants(units, new Set(out)),
    toggle: vi.fn(),
    overriding: false,
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(over: Partial<Parameters<typeof PublishSheet>[0]> = {}) {
    act(() =>
        root.render(
            <PublishSheet
                open
                siteId="s1"
                changes={changes(["site:style"])}
                onFlagsChanged={vi.fn()}
                phone={false}
                pages={[]}
                flags={[]}
                awaitingNavigation={[]}
                publishing={false}
                unsaved={false}
                neverPublished={false}
                pendingSummary="5 sections"
                pendingKnown
                pendingChanges={4}
                pendingSiteChanges={["style"]}
                review={null}
                onAddressSaved={vi.fn()}
                onPublish={vi.fn()}
                onClose={vi.fn()}
                onJump={vi.fn()}
                onAsk={vi.fn()}
                {...over}
            />,
        ),
    );
    return host;
}
const publishButton = () =>
    host.querySelector<HTMLButtonElement>("[data-publish-now]");

describe("the Publish sheet's changes (U11)", () => {
    it("counts what waits, says what visitors see, and publishes 4 of 5 with one left out", () => {
        const onPublish = vi.fn();
        draw({ onPublish });
        expect(host.textContent).toContain("5 changes waiting");
        expect(host.textContent).toContain(
            "Visitors still see the version published on",
        );
        expect(host.textContent).toContain("You");
        expect(host.textContent).toContain("Ritika Sharma");
        expect(publishButton()?.textContent).toBe("Publish 4 of 5 changes now");
        act(() => publishButton()?.click());
        expect(onPublish).toHaveBeenCalledWith({
            leaveOut: ["site:style"],
            overriding: false,
        });
    });

    it("says a teammate's change waits for approval, with Ask, and only an owner may include it", () => {
        draw();
        const row = host.querySelector('[data-unit="site:style"]');
        expect(row?.textContent).toContain(
            "Waiting for Kavya’s approval · left out, stays in the draft",
        );
        expect(row?.textContent).toContain("Ask Kavya");
        const include = Array.from(row?.querySelectorAll("button") ?? []).find(
            (b) => b.textContent === "Include",
        );
        expect(include?.disabled).toBe(true);
        draw({ canOverride: true });
        const owner = Array.from(
            host
                .querySelector('[data-unit="site:style"]')
                ?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent === "Include");
        expect(owner?.disabled).toBe(false);
    });

    it("puts the changes right after the checks, the advice folded below them, and never its own subject as a flag", () => {
        draw({
            flags: [
                {
                    type: "missingSeoDescription",
                    message: "Search results show the first lines.",
                    pageId: null,
                    sectionIndex: null,
                    field: "seoDescription",
                },
                {
                    type: "unpublishedChanges",
                    message: "Visitors still see the last version.",
                    pageId: null,
                    sectionIndex: null,
                    field: null,
                },
            ],
        });
        const text = host.textContent;
        const checks = text.indexOf("Checked before you publish");
        const people = text.indexOf("Ritika Sharma");
        const advice = text.indexOf("1 more thing worth a look");
        expect(checks).toBeGreaterThan(-1);
        expect(checks).toBeLessThan(people);
        expect(people).toBeLessThan(advice);
        expect(
            host.querySelector("[data-flag-advice]")?.hasAttribute("open"),
        ).toBe(false);
        expect(text).not.toContain("Changes visitors cannot see yet");
    });

    it("lists posts apart: they publish on their own", () => {
        draw();
        expect(host.textContent).toContain("Posts publish on their own");
        expect(host.textContent).toContain("Monsoon hair care");
    });

    it("keeps the choices when publishing failed, and offers Try again", () => {
        draw({ error: { message: "Couldn't publish the site." } });
        expect(publishButton()?.textContent).toBe("Try again");
        expect(host.textContent).toContain("What you left out is kept.");
        expect(
            host
                .querySelector('[data-unit="site:style"]')
                ?.hasAttribute("data-left-out"),
        ).toBe(true);
    });

    it("after publishing, says what still waits and opens Tell people", () => {
        draw({
            wentLive: {
                siteName: "Gulmohar",
                address: "gulmohar.saroh.app",
                record: null,
                leftOut: 1,
                alsoLeftOut: [],
            },
            share: {
                page: { id: "home", title: "Home", path: "/", isHome: true },
                business: "Gulmohar",
                host: "gulmohar.saroh.app",
            },
        });
        expect(host.textContent).toContain(
            "1 change left out, still waiting in the draft.",
        );
        act(() =>
            host
                .querySelector<HTMLButtonElement>("[data-tell-people]")
                ?.click(),
        );
        expect(
            document.querySelector('[aria-label="Share this page"]')
                ?.textContent,
        ).toContain("is live");
    });
});
