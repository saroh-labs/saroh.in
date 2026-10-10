// @vitest-environment jsdom
/**
 * A site's "Search and tracking" section (DEC-108, U7): pastes are read in
 * the browser and only the id is sent; a secret never leaves the page; the
 * plan's lock and Saroh's switch-off are said in words with no module
 * names; a failed read draws Retry and no form; someone without
 * `site:update` sees the values and no controls.
 *
 * `react-dom/client` + `act`, as the other component tests do. The tracker
 * dialog is drawn in place: a portal is not what is tested there. A code's
 * and the privacy page's sheets are the real ones (read first, 10 Oct).
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    SearchTrackingRead,
    SearchTrackingView,
} from "@/lib/sites/search-tracking";
import type { SiteAddress } from "@/lib/sites/share-links";
import type { TrackersLock } from "@/lib/sites/trackers-lock";
import {
    TRACKERS_KEPT_LINE,
    TRACKERS_LOCKED_LINE,
} from "@/lib/sites/trackers-lock";

import { SiteSearchTracking } from "./site-search-tracking";
import { SiteSearchTrackingRead } from "./site-search-tracking-read";

const saveSearchTracking = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    saveSearchTracking: (...args: unknown[]) =>
        saveSearchTracking(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
vi.mock("@saroh/ui/dialog", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Dialog: ({
            open,
            children,
        }: {
            open: boolean;
            children?: ReactNode;
        }) => (open ? <div role="dialog">{children}</div> : null),
        DialogContent: Pass,
        DialogHeader: Pass,
        DialogTitle: Pass,
        DialogDescription: Pass,
        DialogFooter: Pass,
    };
});

const GA4 = "G-ABC123XYZ";
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4}');
</script>`;
const GOOGLE_CODE = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234";
const GOOGLE_TAG = `<meta name="google-site-verification" content="${GOOGLE_CODE}" />`;
const SECRET = "phx_1234567890abcdefghijklmnop"; // gitleaks:allow (fake key: the test proves it is refused)

const onSaroh: SiteAddress = {
    host: "rye.saroh.app",
    url: "https://rye.saroh.app",
    platformHost: "rye.saroh.app",
};
const ownDomain: SiteAddress = {
    host: "shop.rye.in",
    url: "https://shop.rye.in",
    platformHost: "rye.saroh.app",
};

const LOCK: TrackersLock = {
    line: TRACKERS_LOCKED_LINE,
    kept: TRACKERS_KEPT_LINE,
    cta: "See Plan B",
    href: "/settings/billing?plan=b#change-plan",
};

function viewOf(over: Partial<SearchTrackingView> = {}): SearchTrackingView {
    return {
        verifications: {
            google: null,
            bing: null,
            meta: null,
            pinterest: null,
        },
        trackers: [],
        privacyUrl: null,
        switchedOff: false,
        ...over,
    };
}

const ok = (view: SearchTrackingView): SearchTrackingRead => ({
    ok: true,
    data: view,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // The switches and PostHog's region measure themselves; jsdom can't.
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    saveSearchTracking.mockReset();
    showSuccess.mockReset();
    showError.mockReset();
    refresh.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(
    read: SearchTrackingRead,
    {
        address = onSaroh,
        lock = null,
    }: { address?: SiteAddress | null; lock?: TrackersLock | null } = {},
) {
    act(() =>
        root.render(
            <SiteSearchTracking
                siteId="site_rye"
                read={read}
                address={address}
                lock={lock}
            />,
        ),
    );
}

const text = () => host.textContent;

function within(selector: string): HTMLElement {
    const el = host.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Nothing at ${selector}`);
    return el;
}

function buttonIn(scope: ParentNode, name: string) {
    return Array.from(scope.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    act(() => {
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function click(el: HTMLElement | undefined) {
    if (!el) throw new Error("Nothing to click");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

/** Lets a save's transition and its awaited action settle. */
async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

/** The open side sheet (a portal), and the name a screen reader gives it. */
const sheet = () =>
    document.querySelector<HTMLElement>('body > [role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};

/** Opens a row's sheet by its button, and hands back the sheet's field. */
async function openSheet(scope: HTMLElement, name: string) {
    await click(buttonIn(scope, name));
    const input = sheet()?.querySelector("input");
    if (!input) throw new Error(`No sheet for ${name}`);
    return input;
}

async function pressInSheet(name: string) {
    await click(buttonIn(sheet() ?? document, name));
    await settle();
}

function openSetup(kind: string) {
    act(() => buttonIn(within(`[data-tracker="${kind}"]`), "Set up")?.click());
    const area = host.querySelector<HTMLTextAreaElement>(
        '[role="dialog"] textarea',
    );
    if (!area) throw new Error("No setup dialog");
    return area;
}

describe("one line per tool, codes folded (the settings audit)", () => {
    it("keeps where to find the ID off the row, for Set up to say", () => {
        render(ok(viewOf()));
        const row = within('[data-tracker="ga4"]');
        expect(row.textContent).toContain("Google Analytics");
        expect(row.textContent).toContain("Not connected");
        expect(row.querySelector("a")).toBe(null);
        openSetup("ga4");
        const dialog = document.querySelector('[role="dialog"]');
        expect(
            Array.from(dialog?.querySelectorAll("a") ?? []).some((a) =>
                a.textContent.startsWith("Help"),
            ),
        ).toBe(true);
    });

    it("shows the common tools and folds the rest behind N more tools", () => {
        render(
            ok(
                viewOf({
                    trackers: [
                        {
                            kind: "plausible",
                            trackerId: "example.com",
                            region: null,
                            enabled: true,
                        },
                    ],
                }),
            ),
        );
        const more = within("details[data-more-tools]");
        expect(more.hasAttribute("open")).toBe(false);
        expect(more.querySelector("summary")?.textContent).toContain(
            "3 more tools",
        );
        const folded = Array.from(
            more.querySelectorAll<HTMLElement>("[data-tracker]"),
        ).map((el) => el.dataset.tracker);
        expect(folded).toEqual(["posthog", "clarity", "umami"]);
        // Connected, so never folded away.
        expect(more.querySelector('[data-tracker="plausible"]')).toBe(null);
        expect(host.querySelector('[data-tracker="plausible"]')).not.toBe(null);
        expect(
            more.querySelector(
                '[data-tracker="ga4"], [data-tracker="meta-pixel"]',
            ),
        ).toBe(null);
    });

    it("folds the verification codes behind one row that says how many", () => {
        render(
            ok(
                viewOf({
                    verifications: {
                        google: "abc",
                        bing: null,
                        meta: null,
                        pinterest: null,
                    },
                }),
            ),
        );
        const codes = within("[data-verification-codes] details");
        expect(codes.hasAttribute("open")).toBe(false);
        expect(codes.querySelector("summary")?.textContent).toContain(
            "Prove the site is yours to Google and Bing. 1 added",
        );
    });
});

describe("connecting a tracker", () => {
    it("takes the ID out of a pasted gtag snippet and sends only the ID", async () => {
        saveSearchTracking.mockResolvedValue({
            ok: true,
            data: viewOf({
                trackers: [
                    {
                        kind: "ga4",
                        trackerId: GA4,
                        region: null,
                        enabled: true,
                    },
                ],
            }),
        });
        render(ok(viewOf()));
        typeInto(openSetup("ga4"), GTAG);
        const dialog = within('[role="dialog"]');
        expect(within("[data-extracted]").textContent).toBe(GA4);

        await click(buttonIn(dialog, "Add to your site"));

        expect(saveSearchTracking).toHaveBeenCalledTimes(1);
        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            trackers: { ga4: { id: GA4 } },
        });
        // Nothing of the snippet but the id left the page.
        expect(JSON.stringify(saveSearchTracking.mock.calls)).not.toMatch(
            /script|gtag|dataLayer/,
        );
        expect(host.querySelector('[role="dialog"]')).toBe(null);
        const row = within('[data-tracker="ga4"]');
        expect(row.textContent).toContain("On");
        expect(row.textContent).toContain(GA4);
        expect(showSuccess).toHaveBeenCalledWith(
            "Added to your live site.",
            "It runs on pages visitors browse after they accept cookies, never on checkout or payment pages.",
        );
    });

    it("says garbage is the wrong code and keeps Save off", () => {
        render(ok(viewOf()));
        typeInto(openSetup("ga4"), "hello there");
        const dialog = within('[role="dialog"]');
        expect(dialog.textContent).toContain(
            "This doesn't look like the right code for this tool.",
        );
        expect(buttonIn(dialog, "Add to your site")?.disabled).toBe(true);
    });

    it("refuses a secret on the spot and sends nothing", async () => {
        render(ok(viewOf()));
        typeInto(openSetup("posthog"), SECRET);
        const dialog = within('[role="dialog"]');
        expect(dialog.textContent).toContain(
            "This looks like a private key. Never paste it here.",
        );
        const add = buttonIn(dialog, "Add to your site");
        expect(add?.disabled).toBe(true);
        await click(add);
        expect(saveSearchTracking).not.toHaveBeenCalled();
    });

    it("says the plan's lock, not an error, when the save meets MODULE_LOCKED", async () => {
        saveSearchTracking.mockResolvedValue({
            ok: false,
            error: "Your own trackers aren't in your plan.",
            plan: {
                code: "MODULE_LOCKED",
                title: "Your own trackers aren't in your plan.",
                body: "",
                cta: "See Plan B",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
                limit: null,
                used: null,
            },
        });
        render(ok(viewOf()));
        typeInto(openSetup("ga4"), GA4);
        await click(buttonIn(within('[role="dialog"]'), "Add to your site"));

        expect(showError).not.toHaveBeenCalled();
        expect(host.querySelector('[role="dialog"]')).toBe(null);
        expect(text()).toContain(TRACKERS_LOCKED_LINE);
        expect(
            host.querySelector(
                'a[href="/settings/billing?plan=b#change-plan"]',
            ),
        ).not.toBe(null);
        expect(buttonIn(host, "Set up")).toBeUndefined();
    });
});

describe("verification codes", () => {
    it("reads first: the row says what is saved, and its field is in a sheet", async () => {
        render(ok(viewOf()));
        const row = within('[data-verification="google"]');
        expect(row.textContent).toContain("Google Search Console");
        expect(row.textContent).toContain("Not set");
        expect(host.querySelector("[data-verification] input")).toBe(null);
        await openSheet(row, "Add");
        expect(sheetName()).toBe("Google Search Console");
        expect(sheet()?.textContent).toContain("enter https://rye.saroh.app");
    });

    it("takes the code out of a pasted meta tag and sends only the code", async () => {
        saveSearchTracking.mockResolvedValue({
            ok: true,
            data: viewOf({
                verifications: {
                    google: GOOGLE_CODE,
                    bing: null,
                    meta: null,
                    pinterest: null,
                },
            }),
        });
        render(ok(viewOf()));
        const row = within('[data-verification="google"]');
        typeInto(await openSheet(row, "Add"), GOOGLE_TAG);
        expect(sheet()?.textContent).toContain(`Code found: ${GOOGLE_CODE}`);
        expect(saveSearchTracking).not.toHaveBeenCalled();

        await pressInSheet("Save");

        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            verifications: { google: GOOGLE_CODE },
        });
        expect(sheet()).toBe(null);
        expect(row.textContent).toContain(GOOGLE_CODE);
        expect(row.textContent).toContain(
            "Added to your live site. Go back to Search Console and press Verify.",
        );
        expect(
            row.querySelector('a[href="https://rye.saroh.app"]')?.textContent,
        ).toBe("View your live page");
        expect(row.textContent).not.toMatch(/\bVerified\b/);
        expect(buttonIn(row, "Edit")).toBeDefined();
    });

    it("refuses a secret in a code field and sends nothing", async () => {
        render(ok(viewOf()));
        const row = within('[data-verification="google"]');
        typeInto(await openSheet(row, "Add"), SECRET);
        expect(sheet()?.textContent).toContain(
            "This looks like a private key. Never paste it here.",
        );
        await pressInSheet("Save");
        expect(saveSearchTracking).not.toHaveBeenCalled();
        // Still open, for the right code to be pasted over it.
        expect(sheetName()).toBe("Google Search Console");
    });

    it("Cancel saves nothing, and a refusal keeps the sheet with what was typed", async () => {
        saveSearchTracking.mockResolvedValue({
            ok: false,
            error: "That code is already used by another site.",
            field: "verifications.google",
        });
        render(ok(viewOf()));
        const row = within('[data-verification="google"]');
        typeInto(await openSheet(row, "Add"), GOOGLE_CODE);
        await pressInSheet("Cancel");
        expect(saveSearchTracking).not.toHaveBeenCalled();
        expect(sheet()).toBe(null);
        expect(row.textContent).toContain("Not set");

        // A fresh draft each time it opens.
        const again = await openSheet(row, "Add");
        expect(again.value).toBe("");
        typeInto(again, GOOGLE_CODE);
        await pressInSheet("Save");
        expect(sheetName()).toBe("Google Search Console");
        expect(sheet()?.querySelector("input")?.value).toBe(GOOGLE_CODE);
        expect(sheet()?.textContent).toContain(
            "That code is already used by another site.",
        );
        expect(row.textContent).toContain("Not set");
    });

    it("clearing a saved code takes it off the live site", async () => {
        const saved = viewOf({
            verifications: {
                google: GOOGLE_CODE,
                bing: null,
                meta: null,
                pinterest: null,
            },
        });
        saveSearchTracking.mockResolvedValue({ ok: true, data: viewOf() });
        render(ok(saved));
        const row = within('[data-verification="google"]');
        const input = await openSheet(row, "Edit");
        expect(input.value).toBe(GOOGLE_CODE);
        expect(sheet()?.textContent).toContain("Clear the box to remove it.");
        typeInto(input, "");
        await pressInSheet("Save");
        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            verifications: { google: null },
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Google Search Console code removed from your live site.",
        );
        expect(row.textContent).toContain("Not set");
    });

    it("uses the custom domain for Search Console and the sitemap", async () => {
        render(ok(viewOf()), { address: ownDomain });
        await openSheet(within('[data-verification="google"]'), "Add");
        expect(sheet()?.textContent).toContain("enter https://shop.rye.in");
        await pressInSheet("Cancel");
        expect(within("[data-live-address]").textContent).toBe(
            "https://shop.rye.in",
        );
        expect(within("[data-sitemap]").textContent).toBe(
            "https://shop.rye.in/sitemap.xml",
        );
        expect(text()).toContain(
            "Your site also opens at rye.saroh.app. Verify shop.rye.in",
        );
        // Meta and Pinterest verify a domain of the business's own.
        expect(host.querySelector('[data-verification="meta"]')).not.toBe(null);
        expect(host.querySelector('[data-verification="pinterest"]')).not.toBe(
            null,
        );
    });

    it("leaves Meta and Pinterest out on the Saroh address, and says why", () => {
        render(ok(viewOf()));
        expect(within("[data-sitemap]").textContent).toBe(
            "https://rye.saroh.app/sitemap.xml",
        );
        expect(host.querySelector('[data-verification="meta"]')).toBe(null);
        expect(host.querySelector('[data-verification="pinterest"]')).toBe(
            null,
        );
        expect(text()).toContain(
            "Meta and Pinterest verify only a domain of your own.",
        );
    });
});

describe("the privacy page", () => {
    const PAGE = "https://rye.example.com/privacy";

    it("reads first, and saves from its sheet", async () => {
        saveSearchTracking.mockResolvedValue({
            ok: true,
            data: viewOf({ privacyUrl: PAGE }),
        });
        render(ok(viewOf()));
        const row = within("[data-privacy-page]");
        expect(row.textContent).toContain(
            "Not set. Without one, visitors see a short notice we write listing your tools.",
        );
        expect(row.querySelector("input")).toBe(null);
        const input = await openSheet(row, "Add");
        expect(sheetName()).toBe("Your privacy page");
        typeInto(input, "rye.example.com/privacy");
        expect(sheet()?.textContent).toContain(
            "Use the full address of your privacy page, starting https://",
        );
        await pressInSheet("Save");
        expect(saveSearchTracking).not.toHaveBeenCalled();
        expect(sheetName()).toBe("Your privacy page");

        typeInto(input, PAGE);
        await pressInSheet("Save");
        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            privacyUrl: PAGE,
        });
        expect(sheet()).toBe(null);
        expect(row.textContent).toContain(PAGE);
        expect(buttonIn(row, "Edit")).toBeDefined();
    });

    it("clearing it removes it, and Cancel leaves it", async () => {
        saveSearchTracking.mockResolvedValue({ ok: true, data: viewOf() });
        render(ok(viewOf({ privacyUrl: PAGE })));
        const row = within("[data-privacy-page]");
        typeInto(await openSheet(row, "Edit"), "");
        await pressInSheet("Cancel");
        expect(saveSearchTracking).not.toHaveBeenCalled();
        expect(row.textContent).toContain(PAGE);

        typeInto(await openSheet(row, "Edit"), "");
        await pressInSheet("Save");
        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            privacyUrl: null,
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Privacy page removed. Visitors see the notice we write.",
        );
        expect(row.textContent).toContain("Not set.");
    });
});

describe("on a plan without trackers", () => {
    it("locks the trackers with the way up, and keeps verification editable", () => {
        render(ok(viewOf()), { lock: LOCK });
        expect(text()).toContain(TRACKERS_LOCKED_LINE);
        expect(
            host.querySelector('a[href="/settings/billing?plan=b#change-plan"]')
                ?.textContent,
        ).toBe("See Plan B");
        expect(buttonIn(host, "Set up")).toBeUndefined();
        expect(
            buttonIn(within('[data-verification="google"]'), "Add"),
        ).toBeDefined();
    });

    it("says a tracker saved before is kept and not running", () => {
        render(
            ok(
                viewOf({
                    trackers: [
                        {
                            kind: "ga4",
                            trackerId: GA4,
                            region: null,
                            enabled: true,
                        },
                    ],
                }),
            ),
            { lock: LOCK },
        );
        const row = within('[data-tracker="ga4"]');
        expect(row.textContent).toContain(TRACKERS_KEPT_LINE);
        expect(row.textContent).toContain("Not running");
        expect(row.querySelector('[role="switch"]')).toBe(null);
        expect(buttonIn(row, "Remove")).toBeDefined();
    });

    it("names no module or catalogue row in what it says", () => {
        render(
            ok(
                viewOf({
                    trackers: [
                        {
                            kind: "ga4",
                            trackerId: GA4,
                            region: null,
                            enabled: true,
                        },
                    ],
                }),
            ),
            { lock: LOCK },
        );
        expect(text()).not.toMatch(/module|site-trackers/i);
    });
});

describe("switched off by Saroh", () => {
    it("says so, says whom to ask, and offers nothing to turn on", () => {
        render(
            ok(
                viewOf({
                    switchedOff: true,
                    trackers: [
                        {
                            kind: "clarity",
                            trackerId: "abc123def",
                            region: null,
                            enabled: true,
                        },
                    ],
                }),
            ),
        );
        expect(text()).toContain(
            "Saroh has switched off trackers on this site.",
        );
        expect(
            host.querySelector('a[href="mailto:contact@saroh.in"]'),
        ).not.toBe(null);
        expect(host.querySelector('[role="switch"]')).toBe(null);
        expect(buttonIn(host, "Set up")).toBeUndefined();
        expect(within('[data-tracker="clarity"]').textContent).toContain(
            "Saved, not running on your site.",
        );
    });
});

describe("states", () => {
    it("draws a failed read as a failure with Retry, never an empty form", async () => {
        render({ ok: false });
        expect(host.querySelector('[role="alert"]')).not.toBe(null);
        expect(text()).toContain("Tracking couldn't be loaded");
        expect(host.querySelector("input, textarea")).toBe(null);
        await click(buttonIn(host, "Retry"));
        expect(refresh).toHaveBeenCalled();
    });

    it("turns a connected tracker off with its ID and says so", async () => {
        const ga4 = {
            kind: "ga4" as const,
            trackerId: GA4,
            region: null,
            enabled: true,
        };
        saveSearchTracking.mockResolvedValue({
            ok: true,
            data: viewOf({ trackers: [{ ...ga4, enabled: false }] }),
        });
        render(ok(viewOf({ trackers: [ga4] })));
        await click(
            within('[data-tracker="ga4"]').querySelector<HTMLElement>(
                '[role="switch"]',
            ) ?? undefined,
        );
        expect(saveSearchTracking).toHaveBeenCalledWith("site_rye", {
            trackers: { ga4: { id: GA4, enabled: false } },
        });
        expect(within('[data-tracker="ga4"]').textContent).toContain("Off");
    });
});

describe("for someone without site:update", () => {
    it("shows the values and no controls", () => {
        const html = renderToStaticMarkup(
            <SiteSearchTrackingRead
                read={ok(
                    viewOf({
                        verifications: {
                            google: GOOGLE_CODE,
                            bing: null,
                            meta: null,
                            pinterest: null,
                        },
                        trackers: [
                            {
                                kind: "ga4",
                                trackerId: GA4,
                                region: null,
                                enabled: true,
                            },
                        ],
                    }),
                )}
                address={onSaroh}
                lock={null}
            />,
        );
        expect(html).toContain(GOOGLE_CODE);
        expect(html).toContain(GA4);
        expect(html).toContain("Changing them is the owner");
        expect(html).not.toMatch(/<input|<textarea|role="switch"/);
        expect(html).not.toMatch(/>Set up<|>Remove<|>Save</);
    });
});
