// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    ChangeUnit,
    Section,
    SiteChanges,
    SitePublication,
} from "@/lib/sites/service";

import type { EditorModel } from "../shell/editor-model";
import { changeWords, historyAfterReload, HistoryPanel } from "./history-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const readSiteChanges = vi.fn();
vi.mock("@/lib/sites/changes-read", () => ({
    readSiteChanges: (id: string) => readSiteChanges(id) as unknown,
}));
const readVersions = vi.fn();
const readVersion = vi.fn();
const readChangesAgainst = vi.fn();
vi.mock("@/lib/sites/history-read", () => ({
    readVersions: (id: string) => readVersions(id) as unknown,
    readVersion: (id: string, v: string) => readVersion(id, v) as unknown,
    readChangesAgainst: (id: string, v: string) =>
        readChangesAgainst(id, v) as unknown,
}));
const revertChange = vi.fn();
vi.mock("@/lib/sites/change-revert-actions", () => ({
    revertChange: (id: string, input: unknown) =>
        revertChange(id, input) as unknown,
}));
const saveDraftSections = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    saveDraftSections: (...a: unknown[]) => saveDraftSections(...a) as unknown,
}));
const restoreVersionAsDraft = vi.fn();
vi.mock("@/lib/sites/version-restore-actions", () => ({
    restoreVersionAsDraft: (...a: unknown[]) =>
        restoreVersionAsDraft(...a) as unknown,
}));
const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);
// The pages themselves are the canvas's and Versions' own, tested there.
vi.mock("@/components/sites/canvas/section-preview", () => ({
    DraftPreview: () => <div data-draft="" />,
}));
vi.mock("@/components/sites/versions/past-version-preview", () => ({
    PastVersionPreview: () => <div data-version="" />,
}));
vi.mock("@/components/sites/canvas/device-frame", () => ({
    DeviceFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/**
 * Rail › History (U46b): the waiting changes with Undo, the versions with
 * Compare and Restore, and nothing that writes for a reader.
 */
let root: Root;
let host: HTMLDivElement;

function unit(key: string, pageId: string | null, label: string): ChangeUnit {
    return {
        key,
        kind: key.startsWith("section:") ? "section" : "site",
        change: "changed",
        label,
        where: pageId === "pg_1" ? "Home" : "About",
        pageId,
        fingerprint: "f",
        editedBy: "u1",
        editedAt: new Date().toISOString(),
        requires: [],
        approval: { state: "not-needed", voided: false, approvers: [] },
    };
}
const UNITS = [
    unit("section:pg_1:a", "pg_1", "Changed · Top of the page"),
    unit("section:pg_1:b", "pg_1", "Hidden · Questions"),
    unit("section:pg_2:c", "pg_2", "Changed · Strip"),
];
function changes(units = UNITS): SiteChanges {
    return {
        siteId: "site_1",
        livePublishedAt: "2026-11-14T12:00:00.000Z",
        count: units.length,
        units,
        groups: [
            {
                userId: "u1",
                name: "Sample Teammate",
                you: false,
                units: units.map((u) => u.key),
            },
        ],
        posts: [],
        approvalRequired: false,
    };
}
const VERSIONS: SitePublication[] = [
    {
        id: "pub_2",
        publishedAt: "2026-11-14T12:40:00.000Z",
        publishedByUserId: "u1",
        publishedBy: "Sample Owner",
        templateId: "t",
        templateVersion: 1,
        isCurrent: true,
        bypass: null,
        reviewRoute: null,
    },
    {
        id: "pub_1",
        publishedAt: "2026-11-09T06:00:00.000Z",
        publishedByUserId: "u1",
        publishedBy: "Sample Owner",
        templateId: "t",
        templateVersion: 1,
        isCurrent: false,
        bypass: null,
        reviewRoute: null,
    },
];

const sections = [
    { key: "a", type: "hero", content: {} },
] as unknown as Section[];

function model(over: Partial<EditorModel> = {}) {
    const m = {
        siteId: "site_1",
        pageId: "pg_1",
        pages: [],
        page: { id: "pg_1", path: "/", title: "Home" },
        address: "sample.saroh.app",
        readOnly: false,
        canUpdateSite: true,
        canPublish: true,
        unsaved: false,
        status: { label: "Live · 3 changes waiting", tone: "info", waiting: 3 },
        draft: { sections, revision: 4 },
        siteStyle: { style: {} },
        styleOptions: {},
        canvasChrome: { name: "Sample", navigation: [], footer: null },
        publish: {
            needsApproval: false,
            canOverride: false,
            recordSaved: vi.fn(),
        },
        releases: {
            releases: [],
            readLive: vi.fn().mockResolvedValue({ sections: 2, site: [] }),
            setPanelOpen: vi.fn(),
        },
        reloadDraft: vi.fn(),
        ...over,
    } as unknown as EditorModel;
    return m;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    readSiteChanges.mockResolvedValue(changes());
    readVersions.mockResolvedValue(VERSIONS);
    readVersion.mockResolvedValue({
        ...VERSIONS[1],
        snapshot: {
            pages: [{ path: "/", title: "Home", isHome: true, sections: [] }],
        },
        renderability: { renderable: true, unrenderable: [] },
    });
    readChangesAgainst.mockResolvedValue(changes());
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

const settle = () => new Promise((r) => setTimeout(r, 0));
async function render(m: EditorModel) {
    await act(async () => {
        root.render(<HistoryPanel model={m} />);
        await settle();
    });
}
const text = () => document.body.textContent;
const buttons = (name: string | RegExp) =>
    Array.from(document.querySelectorAll("button")).filter((b) => {
        const n = b.getAttribute("aria-label") ?? b.textContent;
        return typeof name === "string" ? n === name : name.test(n);
    });
const click = async (b: Element | null | undefined) => {
    expect(b).toBeTruthy();
    await act(async () => {
        (b as HTMLElement).click();
        await settle();
    });
};

describe("HistoryPanel (U46b)", () => {
    it("this page's waiting changes by who made them, each with Undo; Whole site adds the rest", async () => {
        await render(model());
        const waiting = document.querySelector("[data-history-waiting]");
        expect(waiting?.textContent).toContain("Waiting to publish2");
        expect(waiting?.textContent).toContain(
            "Sample Teammate changed Top of the page",
        );
        expect(waiting?.textContent).not.toContain("Strip");
        expect(buttons("Undo")).toHaveLength(2);
        await click(buttons("Whole site")[0]);
        expect(waiting?.textContent).toContain("Waiting to publish3");
        expect(buttons("Undo")).toHaveLength(3);
    });

    it("Undo on this page puts it back as live, restarts on the new draft, and offers it back", async () => {
        const m = model();
        revertChange.mockResolvedValue({
            ok: true,
            data: {
                unitKey: "section:pg_1:a",
                draft: { revision: 7, sections: [] },
            },
        });
        saveDraftSections.mockResolvedValue({ ok: true, data: {} });
        await render(m);
        await click(buttons("Undo")[0]);
        expect(revertChange).toHaveBeenCalledWith("site_1", {
            unitKey: "section:pg_1:a",
        });
        expect(m.reloadDraft).toHaveBeenCalledWith("pg_1");
        // The editor comes back with History open.
        expect(historyAfterReload()).toBe("history");
        const [words, putBack] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(words).toBe("Put back as it is live: Changed · Top of the page");
        await act(async () => {
            await putBack();
        });
        expect(saveDraftSections).toHaveBeenCalledWith(
            "site_1",
            "pg_1",
            sections,
            7,
        );
    });

    it("Undo on another page leaves the editor be: two left, the chip recounted", async () => {
        const m = model();
        revertChange.mockResolvedValue({
            ok: true,
            data: { unitKey: "section:pg_2:c", draft: { revision: 3 } },
        });
        await render(m);
        await click(buttons("Whole site")[0]);
        readSiteChanges.mockResolvedValue(changes(UNITS.slice(0, 2)));
        await click(buttons("Undo")[2]);
        expect(m.reloadDraft).not.toHaveBeenCalled();
        expect(
            document.querySelector("[data-history-waiting]")?.textContent,
        ).toContain("Waiting to publish2");
        expect(m.publish.recordSaved).toHaveBeenCalledWith(2, []);
    });

    it("a refused Undo says why and changes nothing", async () => {
        const m = model();
        revertChange.mockResolvedValue({ ok: false, error: "Not on its own." });
        await render(m);
        await click(buttons("Undo")[0]);
        expect(toast.showError).toHaveBeenCalledWith("Not on its own.");
        expect(m.reloadDraft).not.toHaveBeenCalled();
    });

    it("Undo waits while the draft is still saving", async () => {
        await render(model({ unsaved: true }));
        expect(buttons("Undo").every((b) => b.disabled)).toBe(true);
    });

    it("versions newest first, Live now on the current; one opens Compare with its differences and Restore", async () => {
        const m = model();
        await render(m);
        const list = document.querySelector("[data-history-versions]");
        expect(list?.textContent).toContain("Live now");
        await click(buttons(/^Compare .*9 Nov.* with your draft$/)[0]);
        expect(readChangesAgainst).toHaveBeenCalledWith("site_1", "pub_1");
        const compare = document.querySelector("[data-history-compare]");
        expect(compare?.textContent).toContain("beside your draft now");
        // This page: the two differences on it, numbered.
        expect(compare?.textContent).toContain("2 differences");
        expect(
            document.querySelectorAll("[data-compare-differences] li"),
        ).toHaveLength(2);
        expect(document.querySelector("[data-version]")).not.toBeNull();
        expect(document.querySelector("[data-draft]")).not.toBeNull();
        // Restore as the draft (owner, 20 Nov 2026): its confirm says it
        // goes live only on Publish, then the editor restarts on History.
        restoreVersionAsDraft.mockResolvedValue({
            ok: true,
            data: { publicationId: "pub_1", restored: 1, draft: null },
        });
        await click(buttons(/^Restore .*9 Nov.* as the draft$/)[0]);
        expect(text()).toContain(
            "This replaces your draft with this version. It goes live only when you publish.",
        );
        await click(buttons("Restore as the draft")[0]);
        expect(restoreVersionAsDraft).toHaveBeenCalledWith("site_1", "pub_1", {
            pageId: m.pageId,
            revision: 4,
        });
        expect(m.reloadDraft).toHaveBeenCalled();
        expect(historyAfterReload()).toBe("history");
        await click(buttons("Close compare")[0]);
        expect(document.querySelector("[data-history-compare]")).toBeNull();
    });

    it("keeps the way to every version (Versions)", async () => {
        await render(model());
        const link = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "See all versions",
        );
        expect(link?.getAttribute("href")).toBe("/sites/site_1/versions");
    });

    it("a failed read says so with Try again, never an empty list", async () => {
        readSiteChanges.mockRejectedValue(new Error("down"));
        readVersions.mockResolvedValue(null);
        await render(model());
        expect(text()).toContain("Couldn't load changes");
        expect(text()).toContain("Couldn't load versions");
        expect(text()).not.toContain("Nothing is waiting");
    });

    it("a reader: the lists and Compare, no Undo and no Restore", async () => {
        await render(model({ readOnly: true, canPublish: false }));
        expect(buttons("Undo")).toHaveLength(0);
        await click(buttons(/^Compare /)[1]);
        expect(document.querySelector("[data-history-compare]")).not.toBeNull();
        expect(buttons(/^Restore /)).toHaveLength(0);
    });
});

describe("changeWords", () => {
    it("reads after a name", () => {
        expect(changeWords("Changed · Top of the page")).toBe(
            "changed Top of the page",
        );
    });
});
