// @vitest-environment jsdom
/**
 * Settings › Business › Identity: "What is this?" (DEC-070, K5). The same
 * three answers setup asked with, saved with the Identity card like the
 * name, with Undo; the card's words follow what is saved, and the choice
 * is never offered to a role that may not change settings.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { OrganizationSettingsForm } from "./organization-settings-form";

const save = vi.fn();
const undoSettings = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    saveOrganizationSettings: (...args: unknown[]) => save(...args) as unknown,
    undoOrganizationSettings: (...args: unknown[]) =>
        undoSettings(...args) as unknown,
    undoBusinessLogo: vi.fn(),
    undoStorefrontHours: vi.fn(),
    saveBusinessLogo: vi.fn(),
}));

const showUndo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    dismissToast: vi.fn(),
}));

const refresh = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
    useSearchParams: () => params,
    usePathname: () => "/settings/organization",
}));

// The logo row uploads through the media library; not what is tested here.
vi.mock("@/components/sites/media-picker", () => ({
    useImageUpload: () => ({ upload: vi.fn(), busy: false, error: null }),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: vi.fn(),
}));

function settings(over: Partial<OrganizationSettings> = {}) {
    return {
        id: "org_1",
        name: "Northwind Supply",
        slug: "northwind",
        kind: "BUSINESS",
        profile: {
            legalName: null,
            type: "individual",
            country: "IN",
            taxId: null,
            contactEmail: "hello@northwind.in",
            website: null,
            timezone: "Asia/Kolkata",
            phone: null,
        },
        tradingSince: null,
        logo: null,
        ...over,
    } satisfies OrganizationSettings;
}

let root: Root;
let host: HTMLDivElement;

function draw(s: OrganizationSettings, canEdit = true) {
    act(() =>
        root.render(
            <OrganizationSettingsForm
                settings={s}
                canEdit={canEdit}
                hours={{ state: "ok", storefronts: [] }}
                canEditHours={false}
            />,
        ),
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    save.mockReset();
    undoSettings.mockReset();
    showUndo.mockReset();
    refresh.mockReset();
    params = new URLSearchParams();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

function button(name: string): HTMLButtonElement {
    const hit = Array.from(host.querySelectorAll("button")).find(
        (b) =>
            b.getAttribute("aria-label") === name ||
            b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function radio(name: string): HTMLButtonElement {
    const hit = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent.startsWith(name));
    if (!hit) throw new Error(`No choice ${name}`);
    return hit;
}

const click = async (el: HTMLElement) => {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
    await settle();
};

const card = () =>
    host.querySelector<HTMLElement>('section[aria-label="Identity"]');

describe("What is this? (DEC-070, K5)", () => {
    it("reads what is saved at the top of Identity", () => {
        draw(settings({ kind: "WORK" }));
        expect(card()?.textContent).toContain("What this is");
        expect(card()?.textContent).toContain("A site for my work");
        // The name in the kind's words.
        expect(card()?.textContent).toContain("Your name or brand");
        expect(card()?.textContent).not.toContain("Business name");
    });

    it("switching to Just me saves kind SOLO, and offers Undo", async () => {
        const before = settings();
        const after = settings({ kind: "SOLO" });
        save.mockResolvedValue({ ok: true, data: after });
        undoSettings.mockResolvedValue({ ok: true, data: before });
        draw(before);

        await click(button("Edit identity"));
        const choices = Array.from(
            host.querySelectorAll(
                '[aria-labelledby="business-kind-label"] [role="radio"]',
            ),
        );
        expect(choices.map((c) => c.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
        ]);
        expect(host.textContent).toContain(
            "Changes the words Saroh uses and what it suggests first. Nothing is turned on or off.",
        );

        await click(radio("Just me"));
        await click(button("Save"));

        // Only the kind: nothing else on the card was changed.
        expect(save).toHaveBeenCalledWith({ kind: "SOLO" });
        // It prints on nothing, so the toast doesn't say invoices use it.
        expect(showUndo).toHaveBeenCalledTimes(1);
        const [message, onUndo] = showUndo.mock.calls[0] as [
            string,
            () => void,
        ];
        expect(message).toBe("Identity saved");
        // The card reads the new words at once.
        expect(card()?.textContent).toContain("Just me");
        expect(card()?.textContent).toContain("Your name or brand");

        // Undo sends the kind back, and the words come back with it.
        await act(async () => {
            onUndo();
            await Promise.resolve();
        });
        await settle();
        expect(undoSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                input: { kind: "BUSINESS" },
                expect: { kind: "SOLO" },
            }),
        );
        expect(card()?.textContent).toContain("A business");
        expect(card()?.textContent).toContain("Business name");
    });

    it("is never offered to a role that may not change settings", () => {
        draw(settings({ kind: "SOLO" }), false);
        expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
        expect(
            Array.from(host.querySelectorAll("button")).some(
                (b) => b.getAttribute("aria-label") === "Edit identity",
            ),
        ).toBe(false);
        // Read, as the rest of the card is.
        expect(card()?.textContent).toContain("Just me");
    });

    it("reads a kind an older API never sent as a business", () => {
        draw(settings({ kind: undefined }));
        expect(card()?.textContent).toContain("A business");
        expect(card()?.textContent).toContain("Business name");
    });
});

describe("the addresses named apart (DEC-069, L12)", () => {
    it("draws no address row in Identity: the Web address card is its one place", () => {
        draw(settings());
        expect(card()?.textContent).not.toContain("Workspace address");
        expect(card()?.textContent).not.toContain("Can't be changed");
        expect(card()?.textContent).not.toContain("northwind");
    });

    it('names the registered address row "Registered address"', () => {
        params = new URLSearchParams("section=address");
        draw(settings());
        const region = host.querySelector<HTMLElement>(
            'section[aria-label="Registered address"]',
        );
        const labels = Array.from(region?.querySelectorAll("dt") ?? []).map(
            (dt) => dt.textContent.trim(),
        );
        expect(labels).toContain("Registered address");
        expect(labels).not.toContain("Address");
    });
});

describe("the business type a business that said Registered still owes (prelaunch)", () => {
    const typeField = () => host.querySelector("#business-type");
    const said = (type: string | null, registered: boolean | null) =>
        settings({
            profile: {
                legalName: null,
                type,
                country: "IN",
                taxId: null,
                contactEmail: "hello@northwind.in",
                website: null,
                timezone: "Asia/Kolkata",
                phone: null,
                registered,
            },
        });

    it("says why on the row, and at the field the checklist lands on", async () => {
        draw(said(null, true));
        expect(card()?.textContent).toContain(
            "Not chosen yet — you said it's registered",
        );
        await click(button("Edit identity"));
        expect(typeField()?.textContent).toContain(
            "You said at setup that the business is registered. Choose which kind before you take money.",
        );
    });

    it("goes back to the plain words once a type is chosen", async () => {
        draw(said("llp", true));
        expect(card()?.textContent).toContain("LLP");
        await click(button("Edit identity"));
        expect(typeField()?.textContent).not.toContain("You said at setup");
        expect(typeField()?.textContent).toContain(
            "An individual trades in their own name",
        );
    });

    it("never says it to a business that didn't say Registered", async () => {
        draw(said(null, null));
        expect(card()?.textContent).not.toContain("you said it's registered");
        await click(button("Edit identity"));
        expect(typeField()?.textContent).not.toContain("You said at setup");
    });
});

describe("How to pay us (R32)", () => {
    it("is a tab of its own, after Tax, with its own preview in place of the invoice's", () => {
        params = new URLSearchParams("section=pay");
        draw(
            settings({
                payInstructions: {
                    upiId: "northwind.supply@okexample",
                    bankAccountName: null,
                    bankAccountNumber: null,
                    bankIfsc: null,
                    bankName: null,
                    note: null,
                },
            }),
        );
        const tabs = Array.from(host.querySelectorAll('[role="tab"]')).map(
            (t) => t.textContent.trim(),
        );
        expect(tabs.indexOf("How to pay us")).toBe(
            tabs.indexOf("Tax and invoices") + 1,
        );
        const panel = host.querySelector<HTMLElement>("#business-pay-panel");
        expect(panel?.closest(".hidden")).toBeNull();
        expect(panel?.textContent).toContain("northwind.supply@okexample");
        expect(
            host
                .querySelector('aside[aria-label="How it prints"]')
                ?.classList.contains("hidden"),
        ).toBe(true);
        // Another tab: the card is kept, out of sight.
        expect(host.querySelector("#business-panel")).toBeNull();
    });
});
