// @vitest-environment jsdom
/**
 * The links made in Saroh on Where customers come from (DEC-181, #1099):
 * the list with each link's figures and Copy; Make a link with the label
 * made from the name, shown and editable, "Name the post, not the person."
 * under the name, and the link copied once made; Archive with Undo; a
 * website chosen among several; a role without the website's permission;
 * and a read that failed.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteLinkRead, SiteLinksRead } from "@/lib/insights/link-maker";

import { SiteLinks } from "./site-links";

const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showUndo: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const actions = vi.hoisted(() => ({
    makeSiteLink: vi.fn(),
    archiveSiteLink: vi.fn(),
    restoreSiteLink: vi.fn(),
}));
vi.mock("@/lib/insights/link-actions", () => actions);

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

const clipboard = { writeText: vi.fn(() => Promise.resolve()) };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(navigator, "clipboard", {
        value: clipboard,
        configurable: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 0));

const LINK: SiteLinkRead = {
    id: "l1",
    siteId: "rye",
    name: "Diwali post",
    label: "diwali-post",
    createdAt: "2026-10-20T10:00:00.000Z",
    visits: 12,
    paid: 2,
    few: false,
};
const SMALL: SiteLinkRead = {
    ...LINK,
    id: "l2",
    name: "Bio",
    label: "bio",
    visits: null,
    paid: null,
    few: true,
};
const RYE = { id: "rye", name: "Rye & Co.", url: "https://shop.rye.in" };
const PLUM = { id: "plum", name: "Plum", url: "https://plum.saroh.app" };

function render({
    links = [LINK, SMALL],
    sites = [RYE],
    siteId = null as string | null,
    canMake = true,
    failed = false,
} = {}) {
    const data: SiteLinksRead = { links, minVisits: 3 };
    act(() =>
        root.render(
            <SiteLinks
                read={failed ? { status: "failed" } : { status: "ok", data }}
                sites={sites}
                siteId={siteId}
                canMake={canMake}
                retryHref="/analytics?tab=from"
            />,
        ),
    );
}

const text = () => document.body.textContent;
const button = (name: string) =>
    Array.from(document.querySelectorAll<HTMLElement>("button, a")).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    ) ?? null;
async function press(name: string) {
    const b = button(name);
    if (!b) throw new Error(`No ${name}`);
    await act(async () => {
        b.click();
        await settle();
    });
}
function type(input: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
const field = (label: string) => {
    const l = Array.from(document.querySelectorAll("label")).find(
        (x) => x.textContent.trim() === label,
    );
    const id = l?.getAttribute("for");
    return document.getElementById(id ?? "") as HTMLInputElement;
};

describe("the list", () => {
    it("shows each link's name, label and figures, a small count held back, with Copy", () => {
        render();
        expect(text()).toContain("Links made in Saroh");
        const rows = host.querySelectorAll("[data-testid=site-link]");
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("Diwali post");
        expect(rows[0].textContent).toContain("?ref=diwali-post");
        expect(rows[0].textContent).toContain("12 visits · 2 paid");
        expect(rows[1].textContent).toContain("Fewer than 3 visits");
        expect(button("Copy the link for Diwali post")).not.toBeNull();
    });

    it("copies the site's real address with the label", async () => {
        render();
        await press("Copy the link for Diwali post");
        expect(clipboard.writeText).toHaveBeenCalledWith(
            "https://shop.rye.in/?ref=diwali-post",
        );
    });

    it("says when there are none yet", () => {
        render({ links: [] });
        expect(text()).toContain("No links yet.");
    });

    it("names the website beside each link when there are several", () => {
        render({ sites: [RYE, PLUM] });
        expect(text()).toContain("?ref=diwali-post · Rye & Co.");
    });

    it("keeps Copy without the website's permission, and says who makes links", () => {
        render({ canMake: false });
        expect(button("Make a link")).toBeNull();
        expect(button("Archive Diwali post")).toBeNull();
        expect(button("Copy the link for Diwali post")).not.toBeNull();
        expect(text()).toContain(
            "Links are made by people who can change the website.",
        );
    });

    it("says a read that failed, with Try again", () => {
        render({ failed: true });
        expect(
            host.querySelector("[data-testid=site-links-failed]"),
        ).not.toBeNull();
        expect(text()).toContain("your links");
    });
});

describe("Make a link", () => {
    it("proposes the label from the name, shows the link, and copies it once made", async () => {
        actions.makeSiteLink.mockResolvedValue({
            ok: true,
            data: {
                ...LINK,
                id: "l3",
                name: "Story October",
                label: "story-oct",
                visits: null,
                paid: null,
                few: true,
            },
        });
        render();
        await press("Make a link");
        expect(text()).toContain("Name the post, not the person.");

        type(field("Name"), "Story October");
        expect(field("Label").value).toBe("story-october");
        expect(text()).toContain(
            "The link: https://shop.rye.in/?ref=story-october",
        );
        // The label is the person's to change.
        type(field("Label"), "Story Oct");
        expect(field("Label").value).toBe("story-oct");
        // And the name no longer changes it.
        type(field("Name"), "Story October!");
        expect(field("Label").value).toBe("story-oct");

        await press("Make and copy link");

        expect(actions.makeSiteLink).toHaveBeenCalledWith({
            siteId: "rye",
            name: "Story October!",
            label: "story-oct",
        });
        expect(clipboard.writeText).toHaveBeenCalledWith(
            "https://shop.rye.in/?ref=story-oct",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Story October: link made and copied",
        );
        const rows = host.querySelectorAll("[data-testid=site-link]");
        expect(rows[0].getAttribute("data-label")).toBe("story-oct");
    });

    it("says what is wrong under the field before sending anything", async () => {
        render();
        await press("Make a link");
        type(field("Name"), "Asha");
        type(field("Label"), "asha-98765-43210");
        await press("Make and copy link");
        expect(actions.makeSiteLink).not.toHaveBeenCalled();
        expect(text()).toContain(
            "Use lower-case letters, numbers and hyphens, up to 32, and no more than 6 numbers.",
        );
    });

    it("puts the API's word on a taken label under the label", async () => {
        actions.makeSiteLink.mockResolvedValue({
            ok: false,
            error: "Another link on this site uses diwali-post. Choose another label.",
        });
        render();
        await press("Make a link");
        type(field("Name"), "Diwali post");
        await press("Make and copy link");
        expect(text()).toContain(
            "Another link on this site uses diwali-post. Choose another label.",
        );
        expect(toast.showError).not.toHaveBeenCalled();
    });

    it("asks which website when several and none is chosen", async () => {
        actions.makeSiteLink.mockResolvedValue({ ok: true, data: LINK });
        render({ sites: [RYE, PLUM] });
        await press("Make a link");
        type(field("Name"), "Diwali post");
        await press("Make and copy link");
        expect(actions.makeSiteLink).not.toHaveBeenCalled();
        expect(text()).toContain("Choose the website.");

        await press("Plum");
        await press("Make and copy link");
        expect(actions.makeSiteLink).toHaveBeenCalledWith(
            expect.objectContaining({ siteId: "plum" }),
        );
    });

    it("makes it for the website chosen on the tab", async () => {
        actions.makeSiteLink.mockResolvedValue({ ok: true, data: LINK });
        render({ sites: [RYE, PLUM], siteId: "plum" });
        await press("Make a link");
        expect(button("Rye & Co.")).toBeNull();
        type(field("Name"), "Reel");
        await press("Make and copy link");
        expect(actions.makeSiteLink).toHaveBeenCalledWith({
            siteId: "plum",
            name: "Reel",
            label: "reel",
        });
    });
});

describe("Archive", () => {
    it("takes the link off with Undo, which brings it back where it was", async () => {
        actions.archiveSiteLink.mockResolvedValue({ ok: true, data: LINK });
        actions.restoreSiteLink.mockResolvedValue({ ok: true, data: LINK });
        render();

        await press("Archive Diwali post");
        expect(actions.archiveSiteLink).toHaveBeenCalledWith("l1");
        expect(host.querySelectorAll("[data-testid=site-link]")).toHaveLength(
            1,
        );
        const [message, undo] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(message).toBe("Diwali post archived");

        await act(async () => {
            await undo();
        });
        expect(actions.restoreSiteLink).toHaveBeenCalledWith("l1");
        const rows = host.querySelectorAll("[data-testid=site-link]");
        expect(rows).toHaveLength(2);
        expect(rows[0].getAttribute("data-label")).toBe("diwali-post");
    });

    it("keeps the link when the archive is refused", async () => {
        actions.archiveSiteLink.mockResolvedValue({
            ok: false,
            error: "Couldn't archive that link.",
        });
        render();
        await press("Archive Diwali post");
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't archive that link.",
        );
        expect(host.querySelectorAll("[data-testid=site-link]")).toHaveLength(
            2,
        );
    });
});
