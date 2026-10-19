// @vitest-environment jsdom
/**
 * The booking sheets' customer step (U3, BKMNewBooking step 1): recent
 * customers, a caller added by name and phone alone (DEC-170), the same
 * phone as someone, an email that is someone's, what is missing, a search
 * that fails, Needs attention, and the keyboard.
 */
import { Button } from "@saroh/ui/button";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CustomerPick,
    CustomerSearch,
    CustomerSearchResult,
} from "@/lib/customers/picker";

import { CustomerStep, useCustomerFinder } from "./customer-step";

const findCustomers = vi.fn<(q: string) => Promise<CustomerSearch>>();
const readCustomerAttention = vi.fn();
vi.mock("@/lib/customers/actions", () => ({
    findCustomers: (q: string) => findCustomers(q),
    readCustomerAttention: (id: string) => readCustomerAttention(id) as unknown,
}));

const person = (
    id: string,
    name: string,
    phone: string,
    over: Partial<CustomerSearchResult> = {},
): CustomerSearchResult => ({
    id,
    name,
    email: null,
    phone,
    lastSeenAt: null,
    exactOn: [],
    ...over,
});

const RECENT = [
    person("c_kabir", "Kabir Singh", "+91 90000 12345"),
    person("c_ananya", "Ananya Desai", "+91 90000 23456"),
    person("c_rohan", "Rohan Mehta", "+91 90000 54321"),
];

let root: Root;
let host: HTMLDivElement;
const onPick = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    findCustomers.mockReset();
    readCustomerAttention.mockReset();
    onPick.mockReset();
    findCustomers.mockImplementation((q) =>
        Promise.resolve({
            ok: true,
            results: q
                ? RECENT.filter((r) =>
                      (r.name ?? "").toLowerCase().includes(q.toLowerCase()),
                  )
                : RECENT,
        }),
    );
    readCustomerAttention.mockResolvedValue(null);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function Harness({
    initial = null,
    addButtons = "own",
    canSearch = true,
}: {
    initial?: CustomerPick | null;
    addButtons?: "own" | "foot";
    canSearch?: boolean;
}) {
    const [value, setValue] = useState<CustomerPick | null>(initial);
    const finder = useCustomerFinder({
        value,
        canSearch,
        onPick: (pick) => {
            setValue(pick);
            onPick(pick);
        },
    });
    return (
        <>
            <CustomerStep finder={finder} addButtons={addButtons} />
            {addButtons === "foot" && finder.adding ? (
                <Button type="button" onClick={() => void finder.add()}>
                    Foot: Add and use
                </Button>
            ) : null}
        </>
    );
}

/** Let the search settle (200ms) and its promise land. */
async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 260));
    });
}

async function draw(props: Parameters<typeof Harness>[0] = {}) {
    act(() => root.render(<Harness {...props} />));
    await settle();
}

function button(name: RegExp | string): HTMLButtonElement {
    const hit = Array.from(host.querySelectorAll("button")).find((b) =>
        typeof name === "string"
            ? b.textContent.trim() === name
            : name.test(b.textContent),
    );
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}

function field(label: string): HTMLInputElement {
    const lab = Array.from(host.querySelectorAll("label")).find((l) =>
        l.textContent.startsWith(label),
    );
    const el = document.getElementById(lab?.getAttribute("for") ?? "");
    if (!(el instanceof HTMLInputElement)) throw new Error(`No ${label}`);
    return el;
}

function search(): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(
        'input[aria-label="Find the customer"]',
    );
    if (!el) throw new Error("No search");
    return el;
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

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
    await settle();
}

describe("the customer step", () => {
    it("lists recent customers first, and a press picks one", async () => {
        await draw();
        expect(host.textContent).toContain("Recent customers");
        expect(findCustomers).toHaveBeenCalledWith("");
        await press(button(/Kabir Singh/));
        expect(onPick).toHaveBeenCalledWith({
            kind: "contact",
            id: "c_kabir",
            name: "Kabir Singh",
            email: null,
            phone: "+91 90000 12345",
        });
    });

    it("adds a caller with just a name and a phone (DEC-170)", async () => {
        await draw();
        typeInto(search(), "Zara Ahmed");
        await settle();
        expect(host.textContent).toContain("No one called “Zara Ahmed” yet");
        expect(host.textContent).toContain("Just a name and phone number");
        await press(button(/Add “Zara Ahmed” as a new customer/));
        expect(field("Name").value).toBe("Zara Ahmed");
        expect(host.textContent).toContain("(optional)");
        expect(host.textContent).toContain(
            "Add it to email them their booking.",
        );
        expect(field("Phone").getAttribute("inputmode")).toBe("tel");
        typeInto(field("Phone"), "90000 99999");
        await press(button("Add and use"));
        expect(findCustomers).toHaveBeenCalledWith("+91 90000 99999");
        expect(onPick).toHaveBeenCalledWith({
            kind: "new",
            name: "Zara Ahmed",
            phone: "+91 90000 99999",
            email: "",
        });
    });

    it("says what is missing, on the field, and adds nobody", async () => {
        await draw();
        typeInto(search(), "Zara");
        await settle();
        await press(button(/Add “Zara” as a new customer/));
        await press(button("Add and use"));
        expect(host.textContent).toContain("Add their phone number.");
        expect(field("Phone").getAttribute("aria-invalid")).toBe("true");
        expect(onPick).not.toHaveBeenCalled();
    });

    it("asks when the phone is already someone's: Yes picks them", async () => {
        await draw();
        findCustomers.mockImplementation((q) =>
            Promise.resolve({
                ok: true,
                results: q.includes("54321")
                    ? [
                          person("c_rohan", "Rohan Mehta", "+91 90000 54321", {
                              exactOn: ["phone"],
                          }),
                      ]
                    : [],
            }),
        );
        typeInto(search(), "Zara Ahmed");
        await settle();
        await press(button(/Add “Zara Ahmed”/));
        typeInto(field("Phone"), "90000 54321");
        await press(button("Add and use"));
        expect(host.textContent).toContain("Rohan Mehta has this number");
        expect(host.textContent).toContain(
            "+91 90000 54321 is already saved for Rohan Mehta. Is Zara the same person?",
        );
        expect(onPick).not.toHaveBeenCalled();
        await press(button("Yes, book Rohan Mehta"));
        expect(onPick).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "contact", id: "c_rohan" }),
        );
    });

    it("No adds Zara, kept apart from Rohan by her email", async () => {
        await draw();
        findCustomers.mockImplementation((q) =>
            Promise.resolve({
                ok: true,
                results: q.includes("54321")
                    ? [
                          person("c_rohan", "Rohan Mehta", "+91 90000 54321", {
                              exactOn: ["phone"],
                          }),
                      ]
                    : [],
            }),
        );
        typeInto(search(), "Zara Ahmed");
        await settle();
        await press(button(/Add “Zara Ahmed”/));
        typeInto(field("Phone"), "90000 54321");
        await press(button("Add and use"));
        await press(button("No, add Zara Ahmed"));
        // By phone alone the API would book Rohan: her email is asked for.
        expect(host.textContent).toContain(
            "Rohan Mehta has this number, so add Zara's email to keep them apart.",
        );
        expect(field("Phone").value).toBe("90000 54321");
        typeInto(field("Email"), "zara.ahmed@example.com");
        await press(button("Add and use"));
        expect(onPick).toHaveBeenCalledWith({
            kind: "new",
            name: "Zara Ahmed",
            phone: "+91 90000 54321",
            email: "zara.ahmed@example.com",
        });
    });

    it("an email that is already someone's picks them, and says so", async () => {
        await draw();
        findCustomers.mockImplementation((q) =>
            Promise.resolve({
                ok: true,
                results:
                    q === "priya@example.com"
                        ? [
                              person(
                                  "c_priya",
                                  "Priya Menon",
                                  "+91 90000 45678",
                                  {
                                      email: "priya@example.com",
                                      exactOn: ["email"],
                                  },
                              ),
                          ]
                        : [],
            }),
        );
        typeInto(search(), "Priya");
        await settle();
        await press(button(/Add “Priya”/));
        typeInto(field("Phone"), "90000 11111");
        typeInto(field("Email"), "priya@example.com");
        await press(button("Add and use"));
        expect(onPick).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "contact", id: "c_priya" }),
        );
        expect(host.textContent).toContain(
            "Priya Menon already has that email, so they're picked.",
        );
    });

    it("a search that fails says so, keeps what was typed, and tries again", async () => {
        await draw();
        findCustomers.mockResolvedValue({ ok: false, forbidden: false });
        typeInto(search(), "Ro");
        await settle();
        expect(host.textContent).toContain("Couldn't search your customers");
        expect(search().value).toBe("Ro");
        const calls = findCustomers.mock.calls.length;
        findCustomers.mockResolvedValue({
            ok: true,
            results: RECENT.slice(2, 3),
        });
        await press(button("Try again"));
        expect(findCustomers.mock.calls.length).toBeGreaterThan(calls);
        expect(host.textContent).not.toContain(
            "Couldn't search your customers",
        );
        expect(host.textContent).toContain("Rohan Mehta");
    });

    it("shows the picked customer's Needs attention", async () => {
        readCustomerAttention.mockResolvedValue({
            entries: [
                {
                    id: "a1",
                    kind: "ALLERGY",
                    label: "Latex",
                    sensitive: false,
                },
            ],
            hiddenSensitiveCount: 0,
        });
        await draw({
            initial: {
                kind: "contact",
                id: "c_kabir",
                name: "Kabir Singh",
                email: null,
                phone: "+91 90000 12345",
            },
        });
        expect(readCustomerAttention).toHaveBeenCalledWith("c_kabir");
        expect(host.textContent).toContain("Kabir needs attention.");
        expect(host.textContent).toContain("Latex");
    });

    it("with the flow's foot: the card draws no buttons of its own", async () => {
        await draw({ addButtons: "foot" });
        typeInto(search(), "Zara Ahmed");
        await settle();
        await press(button(/Add “Zara Ahmed”/));
        expect(() => button("Add and use")).toThrow();
        typeInto(field("Phone"), "90000 99999");
        await press(button("Foot: Add and use"));
        expect(onPick).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "new", name: "Zara Ahmed" }),
        );
    });

    it("a role that can't look customers up can still add one", async () => {
        await draw({ canSearch: false });
        expect(findCustomers).not.toHaveBeenCalled();
        expect(host.textContent).toContain(
            "Your role can't look customers up.",
        );
        typeInto(search(), "Zara");
        await settle();
        await press(button(/Add “Zara”/));
        typeInto(field("Phone"), "90000 99999");
        await press(button("Add and use"));
        expect(onPick).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "new", phone: "+91 90000 99999" }),
        );
    });

    it("the keyboard starts in the search, and every row is a button in the tab order", async () => {
        await draw();
        expect(search().hasAttribute("data-autofocus")).toBe(true);
        const rows = Array.from(host.querySelectorAll("li button"));
        expect(rows).toHaveLength(3);
        // A pick moves the flow on: no radio group whose arrows would pick.
        expect(host.querySelector('[role="radiogroup"]')).toBeNull();
        expect(rows.every((b) => b.getAttribute("tabindex") !== "-1")).toBe(
            true,
        );
    });
});
