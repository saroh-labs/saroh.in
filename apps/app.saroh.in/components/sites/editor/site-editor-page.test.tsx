/**
 * The editor's server page (DEC-200): a Reviewer opens the editor itself,
 * read-only, loaded through `…/read`, never `…/draft` (which would create a
 * draft) and never the owner-only reads. An editor loads as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteEditorProps } from "@/components/sites/editor/site-editor-props";

vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
const notFound = vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});
const rethrow = vi.fn();
vi.mock("next/navigation", () => ({
    notFound: () => notFound(),
    unstable_rethrow: (e: unknown) => void rethrow(e),
}));

const svc = vi.hoisted(() => ({
    getSite: vi.fn(),
    getPageDraft: vi.fn(),
    getPageForReview: vi.fn(),
    getSiteFlags: vi.fn(),
    listComments: vi.fn(),
    getReviewState: vi.fn(),
    readWebAddressLinks: vi.fn(),
    readTestReleases: vi.fn(),
}));
vi.mock("@/lib/sites/service", () => ({
    getSite: svc.getSite,
    getPageDraft: svc.getPageDraft,
    getPageForReview: svc.getPageForReview,
    getSiteFlags: svc.getSiteFlags,
    listComments: svc.listComments,
    getReviewState: svc.getReviewState,
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: svc.readWebAddressLinks,
    RENDERER_APEX: "saroh.app",
}));
vi.mock("@/lib/sites/share-links", () => ({
    siteAddressOf: () => ({ host: "rye.saroh.app" }),
}));
vi.mock("@/lib/sites/test-releases-api", () => ({
    readTestReleases: svc.readTestReleases,
}));
vi.mock("@/components/sites/editor/site-editor-host", () => ({
    SiteEditorHost: () => null,
}));
vi.mock("@saroh/ui/data-state", () => ({ FailedState: () => null }));

import Page from "@/app/(editor)/sites/[siteId]/page";

const hero = {
    key: "s1",
    type: "hero",
    contractVersion: 1,
    content: { heading: "Fresh bread daily" },
    hidden: false,
};
// A section whose stored content no longer meets its contract (#275).
const broken = {
    key: "s2",
    type: "hero",
    contractVersion: 1,
    content: { heading: 42 },
    hidden: true,
};

const site = (edit: boolean) => ({
    id: "site_1",
    name: "Rye & Co.",
    can: { edit, manageSettings: edit, publish: edit },
    pages: [
        { id: "page_home", isHome: true, title: "Home", path: "/" },
        { id: "page_about", isHome: false, title: "About", path: "/about" },
    ],
    currentPublicationId: "pub_1",
    currentPublication: { publishedAt: "2026-10-17T10:00:00Z" },
    style: {},
    styleOptions: {},
    styleAccess: { looks: {} },
    template: { id: "tpl_bakery" },
    sellsFrom: { id: "store_1" },
    packsBlockOffered: true,
    addablePageKinds: ["BOOK"],
    publishNeedsApproval: true,
    canOverride: true,
});

const open = async (page?: string) =>
    (await Page({
        params: Promise.resolve({ siteId: "site_1" }),
        searchParams: Promise.resolve(page ? { page } : {}),
    })) as { props: SiteEditorProps & Record<string, unknown> };

beforeEach(() => {
    vi.clearAllMocks();
    svc.listComments.mockResolvedValue([]);
    svc.getReviewState.mockResolvedValue({ latest: null });
    svc.readTestReleases.mockResolvedValue({ state: "off" });
    svc.getSiteFlags.mockResolvedValue({
        flags: [{ id: "f" }],
        awaitingNavigation: [],
    });
    svc.readWebAddressLinks.mockResolvedValue({
        address: "rye",
        platformOrigin: "https://rye.saroh.app",
        canChange: true,
    });
    svc.getPageDraft.mockResolvedValue({
        pageVersionId: "v1",
        revision: 7,
        sections: [hero],
        pendingSectionChanges: 2,
        pendingSiteChanges: [],
    });
    svc.getPageForReview.mockResolvedValue({ sections: [hero, broken] });
});

describe("the editor's page, for a Reviewer", () => {
    it("loads through the read route and opens the editor read-only", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const { props } = await open();
        expect(svc.getPageForReview).toHaveBeenCalledWith(
            "site_1",
            "page_home",
        );
        expect(props.readOnly).toBe(true);
        expect(props.initialSections.map((s) => s.key)).toEqual(["s1", "s2"]);
        // `hidden` travels, so the "Hidden when published" marker can show.
        expect(props.initialSections[1].hidden).toBe(true);
    });

    it("keeps and flags a section that fails its contract", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const { props } = await open();
        expect(props.unreadableSections).toEqual(["s2"]);
    });

    it("never asks for the draft, the flags or the web address", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const { props } = await open();
        expect(svc.getPageDraft).not.toHaveBeenCalled();
        expect(svc.getSiteFlags).not.toHaveBeenCalled();
        expect(svc.readWebAddressLinks).not.toHaveBeenCalled();
        expect(props.initialFlags).toEqual({
            flags: [],
            awaitingNavigation: [],
        });
        expect(props.initialRevision).toBe(0);
        expect(props.initialPendingChanges).toBeNull();
        expect(props.initialPendingSiteChanges).toBeNull();
        // Owner-only props never reach the page payload.
        expect(props.styleAccess).toBeNull();
        expect(props.templateId).toBeNull();
        expect(props.addablePageKinds).toEqual([]);
        expect(props.webAddressFix).toBeNull();
        expect(props.shopOpen).toBe(false);
        expect(props.packsOpen).toBe(false);
        expect(props.publishNeedsApproval).toBe(false);
        expect(props.canOverride).toBe(false);
    });

    it("opens home when ?page= names a page that is gone", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const { props } = await open("page_deleted");
        expect(props.pageId).toBe("page_home");
        expect(svc.getPageForReview).toHaveBeenCalledWith(
            "site_1",
            "page_home",
        );
    });

    it("opens the page asked for", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const { props } = await open("page_about");
        expect(props.pageId).toBe("page_about");
    });

    it("says the draft couldn't be loaded when the read fails", async () => {
        svc.getSite.mockResolvedValue(site(false));
        const failure = new Error("GET …/read 500");
        svc.getPageForReview.mockRejectedValue(failure);
        const { props } = await open("page_about");
        // A 403 or a redirect would be thrown on by `unstable_rethrow`.
        expect(rethrow).toHaveBeenCalledWith(failure);
        expect(props).toEqual({
            title: "Couldn't load the draft",
            description: "Nothing you wrote is lost.",
            retryHref: "/sites/site_1?page=page_about",
        });
        expect(svc.getPageDraft).not.toHaveBeenCalled();
    });
});

describe("the editor's page, for someone who may edit", () => {
    it("loads the draft with its flags, as before", async () => {
        svc.getSite.mockResolvedValue(site(true));
        const { props } = await open();
        expect(svc.getPageDraft).toHaveBeenCalledWith("site_1", "page_home");
        expect(svc.getSiteFlags).toHaveBeenCalled();
        expect(svc.getPageForReview).not.toHaveBeenCalled();
        expect(props.readOnly).toBe(false);
        expect(props.initialRevision).toBe(7);
        expect(props.initialFlags.flags).toHaveLength(1);
        expect(props.styleAccess).toEqual({ looks: {} });
        expect(props.addablePageKinds).toEqual(["BOOK"]);
        expect(props.shopOpen).toBe(true);
        expect(props.canOverride).toBe(true);
        expect(props.webAddressFix).toEqual({
            address: "rye",
            platformOrigin: "https://rye.saroh.app",
            canChange: true,
        });
    });
});
