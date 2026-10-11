/**
 * What the Settings › Business component tests share: a made-up business,
 * the page drawn into a host, and the few ways a test reads a row or
 * drives a sheet. Each test file mocks the actions, the toasts and the
 * address itself (`vi.mock` is per file) and reads the address from here.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type {
    OpeningHoursDay,
    StorefrontHoursRead,
    Weekday,
} from "@/lib/stores/storefronts";

import { OrganizationSettingsForm } from "./organization-settings-form";

export const PROFILE: NonNullable<OrganizationSettings["profile"]> = {
    legalName: null,
    type: "individual",
    country: "IN",
    taxId: null,
    contactEmail: "hello@example.com",
    website: null,
    timezone: "Asia/Kolkata",
    phone: null,
};

export function settings(over: Partial<OrganizationSettings> = {}) {
    return {
        id: "org_1",
        name: "Northwind Supply",
        slug: "northwind",
        kind: "BUSINESS",
        profile: PROFILE,
        tradingSince: null,
        logo: null,
        ...over,
    } satisfies OrganizationSettings;
}

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
/** Open 9 to 6, Monday to Saturday. */
export const WEEK: OpeningHoursDay[] = DAYS.map((day) => ({
    day,
    open: "09:00",
    close: "18:00",
    closed: day === "SUN",
}));
export const ONE_LOCATION: StorefrontHoursRead = {
    state: "ok",
    storefronts: [{ id: "st_hill", name: "Hill Road", openingHours: WEEK }],
};

/** The address's query, which each file's `next/navigation` mock reads. */
export const address = { params: new URLSearchParams() };

/** Arrive on a tab, with anything more in the query (`&edit=logo`). */
export const onTab = (tab: string, more = "") => {
    address.params = new URLSearchParams(`section=${tab}${more}`);
};

export let root: Root;
export let host: HTMLDivElement;

/** Before each test: an empty host, on the page's own address. */
export function mount() {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // Radix's controls measure themselves; jsdom has no layout to measure.
    globalThis.ResizeObserver = class {
        observe = () => undefined;
        unobserve = () => undefined;
        disconnect = () => undefined;
    };
    Element.prototype.scrollIntoView = () => undefined;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    address.params = new URLSearchParams();
    window.history.replaceState(null, "", "/settings/organization");
}

export function unmount() {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
}

/** Arrive afresh: the page as someone else, or by another link. */
export function remount() {
    act(() => root.unmount());
    root = createRoot(host);
}

export function draw(
    s: OrganizationSettings,
    {
        canEdit = true,
        hours = { state: "ok", storefronts: [] },
        canEditHours = false,
    }: {
        canEdit?: boolean;
        hours?: StorefrontHoursRead;
        canEditHours?: boolean;
    } = {},
) {
    act(() =>
        root.render(
            <OrganizationSettingsForm
                settings={s}
                canEdit={canEdit}
                hours={hours}
                canEditHours={canEditHours}
            />,
        ),
    );
}

export async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

/** A button by its words, on the page or in a sheet (a portal). */
export const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent.trim() === name,
    );
/** A row's Edit, by the name a screen reader gives it. */
export const edit = (name: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
/** A row, by its id; what it says is its text. */
export const row = (id: string) => host.querySelector<HTMLElement>(`#${id}`);
export const card = (name: string) =>
    host.querySelector<HTMLElement>(`section[aria-label="${name}"]`);

/** The open sheet, and the name a screen reader gives it. */
export const sheet = () =>
    document.querySelector<HTMLElement>('[role="dialog"]');
export const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
export const input = (name: string) =>
    sheet()?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null;

export async function press(button: HTMLElement | null | undefined) {
    if (!button) throw new Error("Nothing to press");
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
    await settle();
}

export async function pressEscape() {
    await act(async () => {
        document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await Promise.resolve();
    });
    await settle();
}

/** Types into a field the way React hears it. */
export async function type(
    el: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
) {
    if (!el) throw new Error("No field to type in");
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
    });
    await settle();
}
