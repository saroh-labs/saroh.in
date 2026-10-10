// @vitest-environment jsdom
/**
 * The place, read first (owner, 10 Oct): a row for each thing saved, and
 * each row's Edit opening its own side sheet with one Save. The readiness
 * card's "Add address" and "Set hours" open those sheets, and so does a
 * link with `?edit=`. Made-up places only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocationDetails } from "@/lib/stores/location-details";
import type {
    OpeningHoursDay,
    StorefrontSettings,
    Weekday,
} from "@/lib/stores/storefronts";

import { StorefrontsScreen } from "./storefronts-screen";

/** The address's query, as each test sets it. */
const address = vi.hoisted(() => ({ query: "" }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(address.query),
}));
const update = vi.fn();
vi.mock("@/lib/stores/storefront-actions", () => ({
    closeStorefront: vi.fn(),
    updateStorefront: (...args: unknown[]) => update(...args) as unknown,
}));
const updateDetails = vi.fn();
vi.mock("@/lib/stores/actions", () => ({
    updateStore: (...args: unknown[]) => updateDetails(...args) as unknown,
}));
vi.mock("@/lib/members/actions", () => ({
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
}));
// The logo is uploaded through the media library: a picked file becomes
// the picture this answers with.
const upload = vi.fn();
const uploading = vi.hoisted(() => ({ busy: false }));
vi.mock("@/components/sites/media-picker", () => ({
    useImageUpload: () => ({ upload, busy: uploading.busy, error: null }),
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showUndo: vi.fn(),
}));

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
/** Open 9 to 6, Monday to Saturday: the week a new shop starts from. */
const WEEK: OpeningHoursDay[] = DAYS.map((day) => ({
    day,
    open: "09:00",
    close: "18:00",
    closed: day === "SUN",
}));

const hill: StorefrontSettings = {
    id: "st_hill",
    name: "Hill Road",
    orderCount: 0,
    kind: "SHOP",
    paused: false,
    currency: "INR",
    currencyLocked: false,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: "12 Hill Road\nBandra",
    openingHours: WEEK,
    collectionEnabled: true,
    fulfilmentTypes: ["PICKUP"],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    linkSameEmailCustomers: false,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};
const bare: LocationDetails = {
    description: null,
    logo: null,
    businessLogo: null,
};
/** The business logo, and a location's own. */
const RYE = "https://cdn.example.com/rye.png";
const OWN = { url: "https://cdn.example.com/hill.png", mediaId: "m_hill" };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // Radix's controls measure themselves; jsdom has no layout to measure.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    update.mockReset();
    updateDetails.mockReset();
    upload.mockReset();
    uploading.busy = false;
    showError.mockReset();
    showSuccess.mockReset();
    refresh.mockReset();
    address.query = "";
    window.history.replaceState(null, "", "/commerce/locations");
    // Every save is taken, and answers with what was sent.
    update.mockImplementation((_id: string, input: object) =>
        Promise.resolve({ ok: true, data: { ...hill, ...input } }),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(
    over: Partial<StorefrontSettings> = {},
    {
        canEdit = true,
        details = bare,
    }: {
        canEdit?: boolean;
        /** `null` for a page that couldn't read them. */
        details?: LocationDetails | null;
    } = {},
) {
    const store = { ...hill, ...over };
    act(() =>
        root.render(
            <StorefrontsScreen
                businessName="Rye & Co."
                storefronts={[
                    {
                        id: store.id,
                        name: store.name,
                        orderCount: 0,
                        kind: store.kind,
                        paused: false,
                    },
                ]}
                selected={store}
                details={details ?? undefined}
                canCreate
                canEdit={canEdit}
                canClose
            />,
        ),
    );
}

/** A button by its words, on the page or in a sheet (a portal). */
const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
/** A button in the open tab, not the readiness card's of the same name. */
const inTab = (name: string) =>
    item(name, host.querySelector("#location-panel") ?? undefined);
/** A row's Edit, by the name a screen reader gives it. */
const edit = (name: string) =>
    host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
/** What a row says is saved. */
const says = (row: string) =>
    host.querySelector(`[data-testid="location-${row}-summary"]`)?.textContent;
const card = () =>
    host.querySelector<HTMLElement>('[data-testid="location-readiness"]');

/** The open sheet, and the name a screen reader gives it. */
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const field = <T extends HTMLElement = HTMLInputElement>(id: string) =>
    document.querySelector<T>(`#${id}`);
/** A sheet's field by its label's words. */
const labelled = (name: string) => {
    const label = Array.from(sheet()?.querySelectorAll("label") ?? []).find(
        (l) => l.textContent === name,
    );
    return label
        ? field(label.getAttribute("for") ?? "")
        : (null as HTMLInputElement | null);
};

/** Lets a save's transition and its awaited action settle. */
async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function press(button: HTMLButtonElement | null | undefined) {
    await act(async () => {
        button?.click();
        await Promise.resolve();
    });
    await settle();
}

async function pressEscape() {
    await act(async () => {
        document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        await Promise.resolve();
    });
    await settle();
}

/** Types into a controlled field the way React hears it. */
function type(
    el: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
) {
    act(() => {
        if (!el) return;
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("The place's rows", () => {
    it("say what is saved, with nothing open until a row's Edit", () => {
        draw();
        expect(says("name")).toBe("Hill Road");
        expect(says("kind")).toBe("Yes, they visit");
        expect(says("address")).toBe("12 Hill Road, Bandra");
        expect(says("hours")).toBe("Mon–Sat · 9:00 AM – 6:00 PM");
        expect(says("details")).toBe("No description yet · no logo yet");
        expect(sheet()).toBeNull();
        expect(host.querySelector("input, textarea, form")).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it("a place nobody visits has no address or hours row", () => {
        draw({ kind: "ONLINE", fulfilmentTypes: [] });
        expect(says("kind")).toBe("No, online only");
        expect(says("address")).toBeUndefined();
        expect(says("hours")).toBeUndefined();
        expect(edit("Edit address")).toBeNull();
        expect(item("Set hours")).toBeUndefined();
    });

    it("a read-only role sees the rows without Edit, and a link opens no sheet", () => {
        address.query = "edit=name";
        draw({ address: null, openingHours: null }, { canEdit: false });
        expect(says("name")).toBe("Hill Road");
        expect(says("address")).toBe("No address yet");
        expect(says("hours")).toBe("Not set yet");
        expect(
            host.querySelector("#location-panel")?.querySelector("button"),
        ).toBeNull();
        expect(sheet()).toBeNull();
    });
});

describe("the Name sheet", () => {
    const name = () => field("storefront-name");

    it("Edit opens it on the saved name, with its note; Save sends it and closes", async () => {
        draw();
        await press(edit("Edit name"));
        expect(sheetName()).toBe("Name");
        expect(name()?.value).toBe("Hill Road");
        expect(document.activeElement).toBe(name());
        expect(sheet()?.textContent).toContain(
            "Shown at checkout and on receipts. Name the place, like “Hill Road”.",
        );
        type(name(), "  Linking Road ");
        expect(update).not.toHaveBeenCalled();
        await press(item("Save"));
        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith(hill.id, { name: "Linking Road" });
        expect(showSuccess).toHaveBeenCalledWith("Name saved");
        expect(sheet()).toBeNull();
        expect(says("name")).toBe("Linking Road");
        // The title and the list show the name: the page reads again.
        expect(refresh).toHaveBeenCalled();
    });

    it("Cancel saves nothing, returns to the row's Edit, and the next opening starts fresh", async () => {
        draw();
        await press(edit("Edit name"));
        type(name(), "Linking Road");
        await press(item("Cancel"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(says("name")).toBe("Hill Road");
        expect(document.activeElement).toBe(edit("Edit name"));
        await press(edit("Edit name"));
        expect(name()?.value).toBe("Hill Road");
    });

    it("Escape and the close button drop what was typed too", async () => {
        draw();
        await press(edit("Edit name"));
        type(name(), "Linking Road");
        await pressEscape();
        expect(sheet()).toBeNull();
        await press(edit("Edit name"));
        type(name(), "Linking Road");
        await press(item("Close", sheet() ?? document));
        expect(sheet()).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });

    it("an empty name is said in place and not sent", async () => {
        draw();
        await press(edit("Edit name"));
        type(name(), "   ");
        await press(item("Save"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Name is required",
        );
        expect(name()?.getAttribute("aria-invalid")).toBe("true");
    });

    it("Save with nothing changed closes and sends nothing", async () => {
        draw();
        await press(edit("Edit name"));
        await press(item("Save"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("a refusal keeps the sheet open with what was typed", async () => {
        update.mockResolvedValue({ ok: false, error: "Could not save that." });
        draw();
        await press(edit("Edit name"));
        type(name(), "Linking Road");
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("Could not save that.");
        expect(sheetName()).toBe("Name");
        expect(name()?.value).toBe("Linking Road");
        expect(says("name")).toBe("Hill Road");
    });

    it("can't be dismissed while its save is on the way", async () => {
        let done: (v: unknown) => void = () => undefined;
        update.mockReturnValue(new Promise((r) => (done = r)));
        draw();
        await press(edit("Edit name"));
        type(name(), "Linking Road");
        await press(item("Save"));
        expect(item("Saving…")?.disabled).toBe(true);
        await pressEscape();
        expect(sheetName()).toBe("Name");
        await act(async () => {
            done({ ok: true, data: { ...hill, name: "Linking Road" } });
            await Promise.resolve();
        });
        await settle();
        expect(sheet()).toBeNull();
    });
});

describe("the Do customers come here? sheet", () => {
    it("Change opens it on the saved answer, and says what follows from each", async () => {
        draw();
        await press(edit("Change whether customers come here"));
        expect(sheetName()).toBe("Do customers come here?");
        expect(item("Yes, they visit")?.getAttribute("data-state")).toBe("on");
        expect(sheet()?.textContent).toContain(
            "It has an address and opening hours, and can offer pick-up.",
        );
        await press(item("No, online only"));
        expect(sheet()?.textContent).toContain(
            "Its address and opening hours aren't shown, and it can't offer pick-up. The saved address and hours are kept.",
        );
        // Picking an answer saves nothing.
        expect(update).not.toHaveBeenCalled();
    });

    it("Save sends the answer; online only drops the address and hours rows", async () => {
        draw();
        await press(edit("Change whether customers come here"));
        await press(item("No, online only"));
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, { kind: "ONLINE" });
        expect(showSuccess).toHaveBeenCalledWith(
            "This location has no counter now",
        );
        expect(sheet()).toBeNull();
        expect(says("kind")).toBe("No, online only");
        expect(says("address")).toBeUndefined();
        expect(says("hours")).toBeUndefined();
        // Pick-up was on: the row offers turning it off, in one press.
        expect(item("Turn Pick-up off")).toBeDefined();
    });

    it("Cancel leaves the answer as it was", async () => {
        draw();
        await press(edit("Change whether customers come here"));
        await press(item("No, online only"));
        await press(item("Cancel"));
        expect(update).not.toHaveBeenCalled();
        expect(says("kind")).toBe("Yes, they visit");
        expect(document.activeElement).toBe(
            edit("Change whether customers come here"),
        );
    });

    it("saying yes with an address already saved asks for nothing more", async () => {
        draw({ kind: "ONLINE", fulfilmentTypes: [] });
        await press(edit("Change whether customers come here"));
        await press(item("Yes, they visit"));
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, { kind: "SHOP" });
        expect(sheet()).toBeNull();
        expect(says("address")).toBe("12 Hill Road, Bandra");
    });
});

describe("the Address sheet", () => {
    const box = () => field<HTMLTextAreaElement>("storefront-address");

    it("Edit opens it on the saved address, with its limit and note; Save sends it", async () => {
        draw();
        await press(edit("Edit address"));
        expect(sheetName()).toBe("Address");
        expect(box()?.value).toBe("12 Hill Road\nBandra");
        expect(box()?.maxLength).toBe(500);
        expect(sheet()?.textContent).toContain(
            "Printed on receipts, and where pick-up orders are collected.",
        );
        type(box(), " 7 Linking Road\nKhar ");
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, {
            address: "7 Linking Road\nKhar",
        });
        expect(showSuccess).toHaveBeenCalledWith("Location address saved");
        expect(sheet()).toBeNull();
        expect(says("address")).toBe("7 Linking Road, Khar");
    });

    it("with none saved the row says so and offers Add address", async () => {
        draw({ address: null });
        expect(says("address")).toBe("No address yet");
        expect(edit("Edit address")).toBeNull();
        await press(inTab("Add address"));
        expect(sheetName()).toBe("Address");
        expect(box()?.value).toBe("");
    });

    it("an emptied address saves as none", async () => {
        draw();
        await press(edit("Edit address"));
        type(box(), "  ");
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, { address: null });
        expect(says("address")).toBe("No address yet");
    });

    it("Cancel saves nothing; a refusal keeps it open with what was typed", async () => {
        draw();
        await press(edit("Edit address"));
        type(box(), "7 Linking Road");
        await press(item("Cancel"));
        expect(update).not.toHaveBeenCalled();
        expect(says("address")).toBe("12 Hill Road, Bandra");

        update.mockResolvedValue({ ok: false, error: "Could not save that." });
        await press(edit("Edit address"));
        expect(box()?.value).toBe("12 Hill Road\nBandra");
        type(box(), "7 Linking Road");
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("Could not save that.");
        expect(sheetName()).toBe("Address");
        expect(box()?.value).toBe("7 Linking Road");
    });
});

describe("the Opening hours sheet", () => {
    it("Edit opens the editor on the saved week, with Save in the sheet's foot", async () => {
        draw();
        await press(edit("Edit opening hours"));
        expect(sheetName()).toBe("Opening hours");
        const t = sheet()?.textContent ?? "";
        expect(t).toContain("Days");
        expect(t).toContain("Hours");
        expect(t).toContain("Some days have different hours");
        expect(t).toContain(
            "Shown on the receipt, in the location's own time.",
        );
        expect(item("Mon–Sat")?.getAttribute("data-state")).toBe("on");
        // One Save, the sheet's: the editor has none of its own.
        expect(item("Save hours")).toBeUndefined();
        expect(sheet()?.querySelectorAll('button[type="submit"]')).toHaveLength(
            1,
        );
    });

    it("a change of days is sent by Save, as the full seven days", async () => {
        draw();
        await press(edit("Edit opening hours"));
        await press(item("Mon–Fri"));
        expect(update).not.toHaveBeenCalled();
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, {
            openingHours: WEEK.map((d) =>
                d.day === "SAT" ? { ...d, closed: true } : d,
            ),
        });
        expect(showSuccess).toHaveBeenCalledWith("Opening hours saved");
        expect(sheet()).toBeNull();
        expect(says("hours")).toBe("Mon–Fri · 9:00 AM – 6:00 PM");
    });

    it("never saved: Set hours starts from a week, and Save keeps it as it stands", async () => {
        draw({ openingHours: null });
        expect(says("hours")).toBe("Not set yet");
        await press(inTab("Set hours"));
        expect(sheet()?.textContent).toContain(
            "Not saved yet: a starting week. Save it to show it on receipts.",
        );
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(hill.id, { openingHours: WEEK });
        expect(says("hours")).toBe("Mon–Sat · 9:00 AM – 6:00 PM");
    });

    it("Cancel saves nothing; Save with nothing changed sends nothing", async () => {
        draw();
        await press(edit("Edit opening hours"));
        await press(item("Every day"));
        await press(item("Cancel"));
        expect(says("hours")).toBe("Mon–Sat · 9:00 AM – 6:00 PM");
        expect(document.activeElement).toBe(edit("Edit opening hours"));
        await press(edit("Edit opening hours"));
        expect(item("Mon–Sat")?.getAttribute("data-state")).toBe("on");
        await press(item("Save"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("a refusal keeps it open with the days picked", async () => {
        update.mockResolvedValue({ ok: false, error: "Could not save that." });
        draw();
        await press(edit("Edit opening hours"));
        await press(item("Every day"));
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("Could not save that.");
        expect(sheetName()).toBe("Opening hours");
        expect(item("Every day")?.getAttribute("data-state")).toBe("on");
    });
});

describe("the Description and logo sheet", () => {
    const open = () => press(edit("Edit description and logo"));
    /** What the sheet says about the logo in its draft. */
    const logoSays = () =>
        sheet()?.querySelector('[data-testid="location-logo-state"]')
            ?.textContent;
    /** The picture in the sheet, by its alt; the tile has none. */
    const picture = () => sheet()?.querySelector<HTMLImageElement>("img");
    const description = () =>
        labelled("Description") as unknown as HTMLTextAreaElement | null;
    const pick = async (type = "image/png") => {
        const picker =
            sheet()?.querySelector<HTMLInputElement>('input[type="file"]');
        if (!picker) throw new Error("No file field");
        await act(async () => {
            Object.defineProperty(picker, "files", {
                value: [new File(["x"], "logo.png", { type })],
                configurable: true,
            });
            picker.dispatchEvent(new Event("change", { bubbles: true }));
            await Promise.resolve();
        });
        await settle();
    };

    it("the row says whose logo it is, and shows it small", () => {
        draw({}, { details: { ...bare, businessLogo: RYE } });
        expect(says("details")).toBe(
            "Using your business logo · no description yet",
        );
        const thumb = () =>
            host.querySelector<HTMLImageElement>(
                '[data-testid="location-logo-thumb"]',
            );
        expect(thumb()?.getAttribute("src")).toBe(RYE);

        draw(
            {},
            {
                details: {
                    description: "Sourdough since 2019",
                    logo: OWN,
                    businessLogo: RYE,
                },
            },
        );
        expect(says("details")).toBe("Description added · own logo");
        expect(thumb()?.getAttribute("src")).toBe(OWN.url);

        draw({}, { details: bare });
        expect(thumb()).toBeNull();
    });

    it("opens on the description and the logo, with no web link to type and no name or web address", async () => {
        draw(
            {},
            {
                details: {
                    description: "Sourdough since 2019",
                    logo: null,
                    businessLogo: RYE,
                },
            },
        );
        expect(says("details")).toBe(
            "Description added · using your business logo",
        );
        await open();
        expect(sheetName()).toBe("Description and logo");
        expect(description()?.tagName).toBe("TEXTAREA");
        expect(description()?.value).toBe("Sourdough since 2019");
        expect(description()?.maxLength).toBe(500);
        expect(sheet()?.textContent).toContain("20 of 500");
        // The logo is uploaded: the only input is the file picker.
        expect(labelled("Logo address")).toBeNull();
        expect(sheet()?.textContent).not.toContain("Logo address");
        expect(
            Array.from(sheet()?.querySelectorAll("input") ?? []).map(
                (i) => i.type,
            ),
        ).toEqual(["file"]);
        expect(sheet()?.textContent).not.toContain("Web address");
        expect(sheet()?.querySelector('[name="slug"]')).toBeNull();
        expect(sheet()?.querySelector('[name="name"]')).toBeNull();
        // Nothing in it leaves the sheet.
        expect(sheet()?.querySelector("a")).toBeNull();
    });

    it("with no logo of its own it says it uses the business logo, and shows it", async () => {
        draw({}, { details: { ...bare, businessLogo: RYE } });
        await open();
        expect(logoSays()).toBe("Using your business logo");
        expect(picture()?.getAttribute("src")).toBe(RYE);
        expect(picture()?.alt).toBe("Your business logo");
        expect(item("Upload logo")).toBeTruthy();
        expect(item("Use your business logo")).toBeUndefined();
        expect(sheet()?.textContent).toContain(
            "Upload one to give this location its own.",
        );
    });

    it("with its own it shows that, with Replace and the way back to the business logo", async () => {
        draw({}, { details: { ...bare, logo: OWN, businessLogo: RYE } });
        expect(says("details")).toBe("Own logo · no description yet");
        await open();
        expect(logoSays()).toBe("This location has its own logo");
        expect(picture()?.getAttribute("src")).toBe(OWN.url);
        expect(item("Replace")).toBeTruthy();
        expect(item("Use your business logo")).toBeTruthy();
    });

    it("with none anywhere it shows the initial and offers the upload, without sending anyone to Settings", async () => {
        draw();
        await open();
        expect(logoSays()).toBe("No logo yet");
        expect(picture()).toBeNull();
        expect(item("Upload logo")).toBeTruthy();
        expect(sheet()?.textContent).toContain(
            "A logo added in Settings › Business shows here too.",
        );
        expect(sheet()?.querySelector("a")).toBeNull();
    });

    it("an upload becomes the location's logo only on Save, sent as its library image", async () => {
        upload.mockResolvedValue({ src: OWN.url, mediaId: OWN.mediaId });
        updateDetails.mockResolvedValue({ ok: true, data: { id: hill.id } });
        draw({}, { details: { ...bare, businessLogo: RYE } });
        await open();
        type(description(), " Sourdough since 2019 ");
        await pick();
        expect(upload).toHaveBeenCalledTimes(1);
        expect(logoSays()).toBe("This location has its own logo");
        expect(picture()?.getAttribute("src")).toBe(OWN.url);
        // Nothing saved yet: the row still says the business logo.
        expect(updateDetails).not.toHaveBeenCalled();
        expect(says("details")).toBe(
            "Using your business logo · no description yet",
        );

        await press(item("Save"));
        expect(updateDetails).toHaveBeenCalledTimes(1);
        expect(updateDetails).toHaveBeenCalledWith(hill.id, {
            name: "Hill Road",
            description: "Sourdough since 2019",
            logoMediaId: OWN.mediaId,
        });
        expect(showSuccess).toHaveBeenCalledWith("Details saved");
        expect(sheet()).toBeNull();
        expect(says("details")).toBe("Description added · own logo");
        expect(refresh).toHaveBeenCalled();
        // Not the location's own settings route.
        expect(update).not.toHaveBeenCalled();
    });

    it("Use your business logo goes back to it on Save", async () => {
        updateDetails.mockResolvedValue({ ok: true, data: { id: hill.id } });
        draw({}, { details: { ...bare, logo: OWN, businessLogo: RYE } });
        await open();
        await press(item("Use your business logo"));
        expect(logoSays()).toBe("Using your business logo");
        expect(picture()?.getAttribute("src")).toBe(RYE);
        expect(updateDetails).not.toHaveBeenCalled();

        await press(item("Save"));
        expect(updateDetails).toHaveBeenCalledWith(hill.id, {
            name: "Hill Road",
            description: null,
            logoMediaId: null,
        });
        expect(says("details")).toBe(
            "Using your business logo · no description yet",
        );
    });

    it("with no business logo, an own logo's way out is Remove", async () => {
        updateDetails.mockResolvedValue({ ok: true, data: { id: hill.id } });
        draw({}, { details: { ...bare, logo: OWN } });
        await open();
        expect(item("Use your business logo")).toBeUndefined();
        await press(item("Remove"));
        expect(logoSays()).toBe("No logo yet");
        await press(item("Save"));
        expect(updateDetails.mock.calls[0]?.[1]).toMatchObject({
            logoMediaId: null,
        });
        expect(says("details")).toBe("No description yet · no logo yet");
    });

    it("a logo typed in as an address before uploads is kept: a description save sends no logo", async () => {
        const typed = { url: "https://example.com/logo.png", mediaId: null };
        updateDetails.mockResolvedValue({ ok: true, data: { id: hill.id } });
        draw({}, { details: { ...bare, logo: typed, businessLogo: RYE } });
        await open();
        expect(logoSays()).toBe("This location has its own logo");
        expect(picture()?.getAttribute("src")).toBe(typed.url);
        type(description(), "Sourdough since 2019");
        await press(item("Save"));
        expect(updateDetails).toHaveBeenCalledWith(hill.id, {
            name: "Hill Road",
            description: "Sourdough since 2019",
        });
        expect(says("details")).toBe("Description added · own logo");
    });

    it("Save with nothing changed closes without a write", async () => {
        draw({}, { details: { ...bare, logo: OWN, businessLogo: RYE } });
        await open();
        await press(item("Save"));
        expect(updateDetails).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("a wrong file is said under the logo and nothing is uploaded", async () => {
        draw();
        await open();
        await pick("image/gif");
        expect(upload).not.toHaveBeenCalled();
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "That file isn't a PNG, JPG or WebP image.",
        );
        expect(logoSays()).toBe("No logo yet");
    });

    it("Save waits while a logo is uploading", async () => {
        uploading.busy = true;
        draw();
        await open();
        expect(item("Save")?.disabled).toBe(true);
        expect(item("Uploading…")?.disabled).toBe(true);
    });

    it("Cancel saves nothing, even after an upload, and returns to the row's Edit", async () => {
        upload.mockResolvedValue({ src: OWN.url, mediaId: OWN.mediaId });
        draw({}, { details: { ...bare, businessLogo: RYE } });
        await open();
        type(description(), "Sourdough since 2019");
        await pick();
        await press(item("Cancel"));
        expect(updateDetails).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(says("details")).toBe(
            "Using your business logo · no description yet",
        );
        expect(document.activeElement).toBe(edit("Edit description and logo"));
        // Opened again, it starts from what is saved.
        await open();
        expect(description()?.value).toBe("");
        expect(logoSays()).toBe("Using your business logo");
    });

    it("a refusal that names the logo is said under it; any other in a toast; both keep it open with the draft", async () => {
        upload.mockResolvedValue({ src: OWN.url, mediaId: OWN.mediaId });
        updateDetails.mockResolvedValue({
            ok: false,
            error: "A logo is under 1 MB. Choose a smaller image.",
            field: "logo",
        });
        draw();
        await open();
        type(description(), "Sourdough since 2019");
        await pick();
        await press(item("Save"));
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "A logo is under 1 MB. Choose a smaller image.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(sheetName()).toBe("Description and logo");
        expect(description()?.value).toBe("Sourdough since 2019");
        expect(picture()?.getAttribute("src")).toBe(OWN.url);

        updateDetails.mockResolvedValue({
            ok: false,
            error: "Could not save that.",
        });
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith("Could not save that.");
        expect(sheetName()).toBe("Description and logo");
        expect(says("details")).toBe("No description yet · no logo yet");
    });

    it("a read-only role reads the row, logo and all, with no Edit", () => {
        draw({}, { canEdit: false, details: { ...bare, businessLogo: RYE } });
        expect(says("details")).toBe(
            "Using your business logo · no description yet",
        );
        expect(edit("Edit description and logo")).toBeNull();
        expect(sheet()).toBeNull();
    });

    it("has no row, and so no sheet, when they couldn't be read", () => {
        address.query = "edit=details";
        draw({}, { details: null });
        expect(says("details")).toBeUndefined();
        expect(sheet()).toBeNull();
    });
});

describe("opened from outside the tab", () => {
    it("the readiness card's Add address opens the Address sheet, on its field", async () => {
        draw({ address: null, openingHours: null });
        await press(item("Add address", card() ?? undefined));
        expect(sheetName()).toBe("Address");
        expect(document.activeElement?.id).toBe("storefront-address");
    });

    it("the readiness card's Set hours opens the Opening hours sheet", async () => {
        draw({ address: null, openingHours: null });
        await press(item("Set hours", card() ?? undefined));
        expect(sheetName()).toBe("Opening hours");
        expect(sheet()?.contains(document.activeElement)).toBe(true);
        expect(
            document
                .getElementById("storefront-hours")
                ?.contains(document.activeElement),
        ).toBe(true);
    });

    it("from another tab, it opens The place and the sheet on it", async () => {
        address.query = "section=payments";
        draw({ openingHours: null });
        expect(host.querySelector("#location-name")).toBeNull();
        await press(item("Set hours", card() ?? undefined));
        expect(
            host.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent,
        ).toBe("The place");
        expect(sheetName()).toBe("Opening hours");
        // Closed, the keyboard is on the row's own button.
        await press(item("Cancel"));
        expect(document.activeElement?.id).toBe("location-hours-edit");
    });

    it("a link with ?edit=details arrives with the sheet open, and closing it clears the address", async () => {
        address.query = "storefront=st_hill&edit=details";
        window.history.replaceState(
            null,
            "",
            "/commerce/locations?storefront=st_hill&edit=details",
        );
        draw();
        await settle();
        expect(sheetName()).toBe("Description and logo");
        await press(item("Cancel"));
        expect(sheet()).toBeNull();
        expect(window.location.search).toBe("?storefront=st_hill");
    });

    it("a link to a sheet on another tab opens none", async () => {
        address.query = "section=payments&edit=name";
        draw();
        await settle();
        expect(sheet()).toBeNull();
    });
});
