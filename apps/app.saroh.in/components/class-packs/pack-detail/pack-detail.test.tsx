// @vitest-environment jsdom
/**
 * Pack Detail (E16) with its Server Actions answered by the test: Who has
 * it lists each holder with Extend; extending by 7 days says the new date
 * and refreshes; E13's 409 is said in words inside the dialog; a pack
 * nobody holds offers Sell this pack; a failed holders read is named in
 * that tab only; and a role without `pack:write` sees Extend off, with why.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    PackDetail,
    PackHolder,
    PartRead,
} from "@/lib/class-packs/pack-detail-data";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
    usePathname: () => "/class-packs/pk_1",
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

const actions = vi.hoisted(() => ({
    extendHolder: vi.fn(),
    setPackArchived: vi.fn(),
    sellPack: vi.fn(),
}));
vi.mock("@/lib/class-packs/actions", () => actions);

import { PackDetailScreen } from "./pack-detail";

const DAY = 86_400_000;
const NOW = new Date("2026-10-01T06:30:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString();

const PACK: PackDetail = {
    id: "pk_1",
    name: "Ten classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "1500.00",
    currency: "INR",
    status: "ACTIVE",
    services: [{ id: "s1", name: "HIIT" }],
    sold: 1,
    activeHolders: 1,
    createdAt: "2026-08-02T06:30:00.000Z",
    kind: "CLASSES",
    firstPackOnly: false,
    creditsLeft: 6,
    people: 1,
    takings: [{ currency: "INR", amount: "1500.00" }],
    hasPendingChanges: false,
    overview: {
        holders: 1,
        creditsLeft: 6,
        runningOut: 0,
        lostToExpiry: 0,
        sold: 1,
        soldThisMonth: 0,
        takings: [{ currency: "INR", amount: "1500.00" }],
        takingsThisMonth: [],
    },
};

const ASHA: PackHolder = {
    purchaseId: "pp_1",
    contact: { id: "c_1", name: "Asha Rao" },
    credits: 10,
    used: 4,
    left: 6,
    standing: "ACTIVE",
    expiresAt: inDays(40),
    soldAt: "2026-09-01T06:30:00.000Z",
    price: "1500.00",
    currency: "INR",
    paidBy: "UPI",
    extendedDays: 0,
    extensions: [],
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of Object.values(actions)) fn.mockReset();
    for (const fn of Object.values(toast)) fn.mockReset();
    refresh.mockReset();
    window.history.replaceState(null, "", "/class-packs/pk_1?tab=who");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(
    holders: PartRead<PackHolder[]>,
    opts: { canWrite?: boolean; pack?: PackDetail } = {},
) {
    act(() => {
        root.render(
            <PackDetailScreen
                pack={opts.pack ?? PACK}
                holders={holders}
                receipts={null}
                dropIns={null}
                freeCancelHours={undefined}
                timeZone="Asia/Kolkata"
                nowIso={NOW.toISOString()}
                canWrite={opts.canWrite ?? true}
                canSell
                sell={{
                    contacts: [
                        { id: "c_9", name: "Meera", email: "m@example.com" },
                    ],
                    held: [],
                    packs: [opts.pack ?? PACK],
                    invoicesOnSale: false,
                }}
                initialTab="who"
            />,
        );
    });
}

const text = () => document.body.textContent;

function buttons(name: string | RegExp): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) =>
        typeof name === "string"
            ? b.textContent.trim() === name
            : name.test(b.textContent.trim()),
    );
}

function button(name: string | RegExp): HTMLButtonElement {
    const hit = buttons(name).at(0);
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    });
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** The dialog's Extend: the last one on the page, after the row's. */
function saveExtend(): HTMLButtonElement {
    const hit = buttons("Extend").at(-1);
    if (!hit) throw new Error("No Extend in the dialog");
    return hit;
}

function reasonField(): HTMLInputElement {
    const hit = document.querySelector<HTMLInputElement>(
        'input[placeholder^="e.g. Knee injury"]',
    );
    if (!hit) throw new Error("No Reason field");
    return hit;
}

async function flush() {
    await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    });
}

describe("Pack Detail's Who has it", () => {
    it("extends a holder by 7 days: the new date, and a refresh", async () => {
        render({ state: "ok", data: [ASHA] });
        expect(text()).toContain("Can still use · 1");
        expect(text()).toContain("6 of 10");
        expect(text()).toContain("Use by 10 Nov");
        expect(text()).toContain("Bought 1 Sep · ₹1,500 · UPI");
        const link = document.querySelector('a[aria-label="Open Asha Rao"]');
        expect(link?.getAttribute("href")).toBe("/customers/c_1");

        click(button("Extend"));
        expect(text()).toContain("Extend Asha Rao's pack");
        // Nothing saves without a reason.
        const extend = buttons("Extend").at(-1);
        expect(extend?.disabled).toBe(true);

        click(button("+7 days"));
        expect(text()).toContain("New use-by: Tue 17 Nov");
        typeInto(reasonField(), "Knee injury");
        actions.extendHolder.mockResolvedValue({
            ok: true,
            data: { ...ASHA, expiresAt: inDays(47), extendedDays: 7 },
        });
        expect(buttons("Extend").at(-1)?.disabled).toBe(false);
        click(saveExtend());
        await flush();
        expect(actions.extendHolder).toHaveBeenCalledWith(
            "pp_1",
            7,
            "Knee injury",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Asha's pack now runs to 17 Nov.",
        );
        expect(refresh).toHaveBeenCalled();
        expect(text()).not.toContain("Extend Asha Rao's pack");
    });

    it("says E13's 409 in the merchant's words and keeps the dialog", async () => {
        render({ state: "ok", data: [ASHA] });
        click(button("Extend"));
        typeInto(reasonField(), "Travel");
        actions.extendHolder.mockResolvedValue({
            ok: false,
            error: "Nothing left to extend",
            status: 409,
        });
        click(saveExtend());
        await flush();
        expect(text()).toContain(
            "Asha has nothing left on this pack, so there's nothing to extend.",
        );
        expect(text()).not.toContain("Nothing left to extend");
        expect(text()).toContain("Extend Asha Rao's pack");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a pack nobody holds offers Sell this pack", () => {
        render({ state: "ok", data: [] });
        expect(text()).toContain("Nobody has this pack yet");
        click(button("Sell this pack"));
        expect(text()).toContain("Sell Ten classes");
    });

    it("a failed holders read is named in this tab, and the page stays", () => {
        render({ state: "failed" });
        expect(text()).toContain("Who has it could not be loaded");
        expect(button("Try again")).toBeTruthy();
        // The header and the tabs are still there.
        expect(document.querySelector("h1")?.textContent).toBe("Ten classes");
        click(button("Try again"));
        expect(refresh).toHaveBeenCalled();
        click(button("Overview"));
        expect(text()).toContain("Linked to this pack");
        expect(text()).not.toContain("could not be loaded");
    });

    it("a role that can't change packs sees Extend off, with why", () => {
        render({ state: "ok", data: [ASHA] }, { canWrite: false });
        const extend = button("Extend");
        expect(extend.disabled).toBe(true);
        expect(text()).toContain("Your role can't extend packs");
        expect(text()).not.toContain("Edit pack");
    });

    it("a used-up holder has Extend off: nothing left to extend", () => {
        render({
            state: "ok",
            data: [
                ASHA,
                {
                    ...ASHA,
                    purchaseId: "pp_2",
                    contact: { id: "c_2", name: "Ravi" },
                    left: 0,
                    used: 10,
                    standing: "USED_UP",
                },
            ],
        });
        click(button(/^Used up or expired/));
        expect(text()).toContain("All used");
        expect(button("Extend").disabled).toBe(true);
        expect(text()).toContain("Nothing left to extend");
    });
});

describe("Pack Detail's header and tabs", () => {
    it("draws only the tabs that are built, and keeps the tab in the address", () => {
        render({ state: "ok", data: [ASHA] });
        const tabs = Array.from(
            document.querySelectorAll(
                '[role="tablist"][aria-label="Pack sections"] [role="tab"]',
            ),
        ).map((t) => t.textContent);
        expect(tabs).toEqual(["Overview", "Who has it1"]);
        click(button("Overview"));
        expect(window.location.search).toBe("");
        click(button(/^Who has it/));
        expect(window.location.search).toBe("?tab=who");
    });

    it("an archived pack can't be sold, says why, and offers Sell again", () => {
        render(
            { state: "ok", data: [ASHA] },
            { pack: { ...PACK, status: "ARCHIVED" } },
        );
        expect(button("Sell at the desk").disabled).toBe(true);
        expect(text()).toContain("Archived.");
        expect(text()).toContain(
            "Nobody new can buy it. 1 person keeps their classes until their dates.",
        );
        expect(button("Sell again")).toBeTruthy();
    });

    it("the customer view shows the offer", () => {
        render({ state: "ok", data: [ASHA] });
        click(button("Customer view"));
        expect(text()).toContain("Buy a pack and use 1 now");
        expect(text()).toContain("10 classes · ₹150 a class · use by 30 Nov");
    });
});
