import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountEntry } from "./account-entry";
import { AccountHome } from "./account-home";
import type { MeApi } from "./me";
import { Me } from "./me";
import type {
    AccountPlan,
    AccountView,
    AccountHome as HomeData,
} from "./model";
import {
    accountMoney,
    bookingWhen,
    classesLine,
    firstName,
    initials,
    orderTitle,
    planLine,
} from "./model";
import { currentTab } from "./tab-bar";

/**
 * The account area in jsdom (round-2 plan A, A5): its words, Home's blocks
 * (a failed read says so and never reads as none), Me's calls, and the
 * header's entry. The look is the browser pass's; this pins the words and
 * the calls.
 */

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/me",
}));

beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
});

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah@example.in",
    phone: "+91 98765 43210",
    businessName: "Kavi Dental",
    tabs: [
        { key: "home", label: "Home" },
        { key: "me", label: "Me" },
    ],
    offers: { appointments: true, orders: false, plans: false },
    bookingsLabel: "Appointments",
    healthNotes: false,
};

const PLAN: AccountPlan = {
    ref: "sub_1",
    name: "Unlimited",
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    renewsAt: "2026-10-18T00:00:00.000Z",
    pausedUntil: null,
    endsAt: null,
};

describe("the account's words", () => {
    it("names and initials", () => {
        expect(firstName("Farah Khan")).toBe("Farah");
        expect(firstName(null)).toBe(null);
        expect(firstName("  ")).toBe(null);
        expect(initials("Farah Khan", "f@x.in")).toBe("FK");
        expect(initials(null, "rahul@x.in")).toBe("R");
    });

    it("money drops whole paise, and a booking reads in its own zone", () => {
        expect(accountMoney("2500.00", "INR")).toBe("₹2,500");
        expect(accountMoney("12.50", "INR")).toBe("₹12.50");
        expect(bookingWhen("2026-10-05T04:30:00.000Z", "Asia/Kolkata")).toBe(
            "Mon 5 Oct, 10:00",
        );
    });

    it("a plan says when it renews, pauses or ends", () => {
        expect(planLine(PLAN)).toBe("Next payment 18 Oct 2026");
        expect(planLine({ ...PLAN, status: "PAUSED", renewsAt: null })).toBe(
            "Paused — nothing is charged until you resume",
        );
        expect(
            planLine({ ...PLAN, renewsAt: null, endsAt: PLAN.renewsAt }),
        ).toBe("Ends 18 Oct 2026");
    });

    it("classes left and an order's lines", () => {
        expect(
            classesLine({
                membership: {
                    plan: "Unlimited",
                    perMonth: 12,
                    left: 6,
                    resetsAt: "2026-11-01T00:00:00.000Z",
                    paused: false,
                },
                packs: [
                    {
                        name: "10 classes",
                        credits: 10,
                        left: 4,
                        expiresAt: "2026-12-01T00:00:00.000Z",
                    },
                ],
            }),
        ).toBe(
            "Unlimited: 6 left this month · 10 classes: 4 left, use by 1 Dec 2026",
        );
        expect(
            orderTitle({
                ref: "o",
                number: "1019",
                placedAt: "2026-09-20T00:00:00.000Z",
                total: "450.00",
                currency: "INR",
                open: true,
                status: "Ready",
                fulfilment: "Pick-up",
                items: [
                    { name: "Sourdough", quantity: 2 },
                    { name: "Rye", quantity: 1 },
                ],
                moreItems: 2,
            }),
        ).toBe("#1019 · 2 × Sourdough, 1 × Rye and 2 more");
    });

    it("the tab bar marks the tab a path is on", () => {
        const tabs = ACCOUNT.tabs;
        expect(currentTab("/account", tabs)).toBe("home");
        expect(currentTab("/account/me", tabs)).toBe("me");
        expect(currentTab("/account/receipts/inv_1", tabs)).toBe(null);
        expect(currentTab(null, tabs)).toBe(null);
    });
});

describe("Home", () => {
    const home: HomeData = {
        nextBooking: {
            ok: true,
            value: {
                ref: "bk_1",
                service: "Check-up",
                startAt: "2026-10-05T04:30:00.000Z",
                endAt: "2026-10-05T05:00:00.000Z",
                timezone: "Asia/Kolkata",
                staff: "Dr. Rao",
                online: false,
            },
        },
        classes: { ok: true, value: null },
        orders: null,
        plan: { ok: true, value: PLAN },
    };

    it("shows the next appointment and the plan, under the header's greeting", () => {
        render(<AccountHome account={ACCOUNT} home={home} />);
        // "Hi, Farah" is the account header's title now (DEC-073 #10).
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        expect(
            screen.getByRole("heading", { name: "Next appointment" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Check-up · Mon 5 Oct, 10:00"),
        ).toBeInTheDocument();
        expect(screen.getByText("With Dr. Rao")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Book an appointment" }),
        ).toHaveAttribute("href", "/book");
        expect(
            screen.getByText("Unlimited · ₹2,500 / month"),
        ).toBeInTheDocument();
        // No Orders card for a business that doesn't sell, and no Classes
        // left card without classes.
        expect(screen.queryByText("Your orders")).toBeNull();
        expect(screen.queryByText("Classes left")).toBeNull();
        // Move and Cancel open their sheets on the Bookings tab (A6).
        expect(
            screen.getByRole("link", { name: "Move Check-up" }),
        ).toHaveAttribute("href", "/account/bookings?move=bk_1");
        expect(
            screen.getByRole("link", { name: "Cancel Check-up" }),
        ).toHaveAttribute("href", "/account/bookings?cancel=bk_1");
    });

    it("a failed read says so and never reads as none", () => {
        render(
            <AccountHome
                account={{ ...ACCOUNT, bookingsLabel: "Bookings" }}
                home={{
                    nextBooking: { ok: false },
                    classes: { ok: false },
                    orders: { ok: false },
                    plan: { ok: false },
                }}
            />,
        );
        expect(
            screen.getByText(/Orders couldn't be loaded/),
        ).toBeInTheDocument();
        expect(screen.queryByText("No orders yet.")).toBeNull();
        expect(
            screen.getByText(/Your bookings couldn't be loaded/),
        ).toBeInTheDocument();
        expect(screen.queryByText("Nothing booked")).toBeNull();
        expect(
            screen.getByText(/Your classes couldn't be loaded/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Your plan couldn't be loaded/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Next up" }),
        ).toBeInTheDocument();
    });

    it("nothing booked and no orders are said as such", () => {
        render(
            <AccountHome
                account={ACCOUNT}
                home={{
                    nextBooking: { ok: true, value: null },
                    classes: { ok: true, value: null },
                    orders: { ok: true, value: [] },
                    plan: { ok: true, value: null },
                }}
            />,
        );
        expect(screen.getByText("Nothing booked")).toBeInTheDocument();
        expect(screen.getByText("No orders yet.")).toBeInTheDocument();
        expect(screen.queryByText("Membership")).toBeNull();
    });
});

async function click(element: HTMLElement) {
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

function meApi(overrides: Partial<MeApi> = {}): MeApi {
    return {
        updateDetails: vi.fn<MeApi["updateDetails"]>().mockResolvedValue({
            ok: true,
            account: { ...ACCOUNT, name: "Farah K" },
        }),
        emailChange: {
            requestCode: vi.fn().mockResolvedValue({
                ok: true,
                resendAfterSeconds: 30,
            }),
            verifyCode: vi.fn().mockResolvedValue({
                ok: true,
                customer: { email: "new@example.in", name: "Farah Khan" },
            }),
        },
        addNote: vi.fn<MeApi["addNote"]>().mockResolvedValue({
            ok: true,
            note: {
                ref: "n1",
                text: "Blood thinners",
                sentAt: "2026-09-28T00:00:00.000Z",
                state: "SENT",
            },
        }),
        signOut: vi.fn<MeApi["signOut"]>().mockResolvedValue({ ok: true }),
        signOutEverywhere: vi
            .fn<MeApi["signOutEverywhere"]>()
            .mockResolvedValue({ ok: true }),
        ...overrides,
    };
}

const OPTIONS = {
    businessName: "Kavi Dental",
    phone: null,
    challenge: { required: false, siteKey: null },
};

describe("Me", () => {
    it("shows the details and the receipts, with no health notes until C12", () => {
        render(
            <Me
                account={ACCOUNT}
                receipts={{
                    ok: true,
                    value: [
                        {
                            ref: "inv_1",
                            number: "KD-0001",
                            issuedAt: "2026-09-01T00:00:00.000Z",
                            paidAt: "2026-09-02T00:00:00.000Z",
                            total: "12000.00",
                            currency: "INR",
                        },
                        {
                            ref: "inv_2",
                            number: "KD/26-27/0002",
                            issuedAt: "2026-09-03T00:00:00.000Z",
                            paidAt: "2026-09-03T00:00:00.000Z",
                            total: "900.00",
                            currency: "INR",
                            // D15: an exempt paper is named as the clinic's copy is.
                            billOfSupply: true,
                        },
                    ],
                }}
                notes={null}
                options={OPTIONS}
                api={meApi()}
            />,
        );
        expect(
            screen.getByText("Bill of supply KD/26-27/0002"),
        ).toBeInTheDocument();
        expect(screen.getByText("Farah Khan")).toBeInTheDocument();
        expect(
            screen.getByText("+91 98765 43210 · farah@example.in"),
        ).toBeInTheDocument();
        expect(screen.getByText("Receipt KD-0001")).toBeInTheDocument();
        expect(screen.getByText("2 Sept 2026 · ₹12,000")).toBeInTheDocument();
        expect(
            screen.getAllByRole("link", { name: "View" })[0],
        ).toHaveAttribute("href", "/account/receipts/inv_1");
        expect(screen.queryByText("Health notes")).toBeNull();
        expect(screen.queryByText(/Remove my details/)).toBeNull();
    });

    it("receipts that failed to load say so, not 'No receipts yet'", () => {
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: false }}
                notes={null}
                options={OPTIONS}
                api={meApi()}
            />,
        );
        expect(
            screen.getByText(/Receipts couldn't be loaded/),
        ).toBeInTheDocument();
        expect(screen.queryByText("No receipts yet.")).toBeNull();
    });

    it("saves the name and phone through the site's server", async () => {
        const api = meApi();
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                options={OPTIONS}
                api={api}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        const name = screen.getByLabelText("Name");
        fireEvent.change(name, { target: { value: "Farah K" } });
        await click(screen.getByRole("button", { name: "Save" }));
        expect(api.updateDetails).toHaveBeenCalledWith({
            name: "Farah K",
            phone: "+91 98765 43210",
        });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("says why a save was refused", async () => {
        const api = meApi({
            updateDetails: vi.fn<MeApi["updateDetails"]>().mockResolvedValue({
                ok: false,
                message: "Enter a phone number, like +91 98765 43210",
            }),
        });
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                options={OPTIONS}
                api={api}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        await click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Enter a phone number",
        );
    });

    it("changes the email with a code to the new address", async () => {
        const requestCode = vi.fn().mockResolvedValue({
            ok: true,
            resendAfterSeconds: 30,
        });
        const verifyCode = vi.fn().mockResolvedValue({
            ok: true,
            customer: { email: "new@example.in", name: "Farah Khan" },
        });
        const api = meApi({ emailChange: { requestCode, verifyCode } });
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                options={OPTIONS}
                api={api}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Change email" }));
        expect(
            screen.getByRole("heading", { name: "Change your sign-in email" }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/The same code creates/)).toBeNull();
        fireEvent.change(screen.getByLabelText("New email"), {
            target: { value: "new@example.in" },
        });
        await click(screen.getByRole("button", { name: "Send code" }));
        expect(requestCode).toHaveBeenCalledWith("new@example.in", undefined);
        fireEvent.change(screen.getByLabelText("Code"), {
            target: { value: "123456" },
        });
        await click(screen.getByRole("button", { name: "Confirm new email" }));
        expect(verifyCode).toHaveBeenCalledWith("new@example.in", "123456");
        expect(
            await screen.findByText(/Use that email to sign in from now on/),
        ).toBeInTheDocument();
    });

    it("sends a health note once they're open, and lists it as sent", async () => {
        const api = meApi();
        render(
            <Me
                account={{ ...ACCOUNT, healthNotes: true }}
                receipts={{ ok: true, value: [] }}
                notes={{ ok: true, value: [] }}
                options={OPTIONS}
                api={api}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Health notes" }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
        fireEvent.change(screen.getByLabelText("Note"), {
            target: { value: "Blood thinners" },
        });
        await click(screen.getByRole("button", { name: "Send to the team" }));
        expect(api.addNote).toHaveBeenCalledWith("Blood thinners");
        expect(
            await screen.findByText("Sent · the team will confirm it"),
        ).toBeInTheDocument();
    });

    it("words the notes card by what the business is (UX-040)", () => {
        const at = (notesKind: "health" | "food" | "general") =>
            render(
                <Me
                    account={{ ...ACCOUNT, healthNotes: true, notesKind }}
                    receipts={{ ok: true, value: [] }}
                    notes={{ ok: true, value: [] }}
                    options={OPTIONS}
                    api={meApi()}
                />,
            );
        const bakery = at("food");
        expect(
            screen.getByRole("heading", { name: "Allergies and notes" }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/medicines/)).toBeNull();
        bakery.unmount();
        const shop = at("general");
        expect(
            screen.getByRole("heading", { name: "Notes for the team" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Health notes")).toBeNull();
        shop.unmount();
        at("health");
        expect(
            screen.getByRole("heading", { name: "Health notes" }),
        ).toBeInTheDocument();
    });

    it("signs out here, or everywhere", async () => {
        const api = meApi();
        render(
            <Me
                account={ACCOUNT}
                receipts={{ ok: true, value: [] }}
                notes={null}
                options={OPTIONS}
                api={api}
            />,
        );
        await click(
            screen.getByRole("button", { name: "Sign out everywhere" }),
        );
        expect(api.signOutEverywhere).toHaveBeenCalled();
        expect(router.push).toHaveBeenCalledWith("/");
    });
});

describe("the header's account entry", () => {
    const signIn = {
        requestCode: vi.fn(),
        verifyCode: vi.fn(),
    };

    it("a signed-in customer's initials open the account", () => {
        render(
            <AccountEntry
                customer={{ email: "farah@example.in", name: "Farah Khan" }}
                businessName="Kavi Dental"
                api={signIn}
                loadOptions={vi.fn()}
            />,
        );
        const link = screen.getByRole("link", { name: "My account" });
        expect(link).toHaveAttribute("href", "/account");
        expect(link).toHaveTextContent("FK");
    });

    async function signInThrough(variant: "header" | "page") {
        const api = {
            requestCode: vi
                .fn()
                .mockResolvedValue({ ok: true, resendAfterSeconds: 30 }),
            verifyCode: vi.fn().mockResolvedValue({
                ok: true,
                customer: { email: "farah@example.in", name: "Farah" },
            }),
        };
        render(
            <AccountEntry
                customer={null}
                businessName="Kavi Dental"
                api={api}
                loadOptions={vi.fn().mockResolvedValue(OPTIONS)}
                variant={variant}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "farah@example.in" },
        });
        await click(screen.getByRole("button", { name: "Send code" }));
        fireEvent.change(screen.getByLabelText("Code"), {
            target: { value: "123456" },
        });
        const dialog = screen.getByRole("dialog");
        await click(
            Array.from(dialog.querySelectorAll("button")).find(
                (b) => b.textContent === "Sign in",
            ) as HTMLElement,
        );
    }

    it("the account's own prompt keeps the page that asked (UX-052)", async () => {
        await signInThrough("page");
        expect(router.push).not.toHaveBeenCalled();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("the header's Sign in opens the account", async () => {
        await signInThrough("header");
        expect(router.push).toHaveBeenCalledWith("/account");
    });

    it("Sign in opens the sheet at once and reads its options behind it (#838)", async () => {
        let land: (options: typeof OPTIONS) => void = () => undefined;
        const loadOptions = vi.fn(
            () =>
                new Promise<typeof OPTIONS>((resolve) => {
                    land = resolve;
                }),
        );
        render(
            <AccountEntry
                customer={null}
                businessName="Kavi Dental"
                api={signIn}
                loadOptions={loadOptions}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        // Open before the read answers, with the field ready for typing.
        expect(
            screen.getByRole("heading", { name: "Sign in — Kavi Dental" }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toHaveFocus();
        expect(loadOptions).toHaveBeenCalledTimes(1);
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "farah@example.in" },
        });
        await act(async () => {
            land(OPTIONS);
            await Promise.resolve();
        });
        expect(screen.getByLabelText("Email")).toHaveValue("farah@example.in");
    });
});
