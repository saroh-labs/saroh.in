// @vitest-environment jsdom
/**
 * A billing profile's page (F2Page) and what opens from it: Edit details
 * (F3), Move (F5, paid and free), Remove (F6) and the sync card (F7), in
 * the design's words. Made-up profiles; the Server Actions are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "./profile-page";
import {
    ASHA,
    button,
    detail,
    dialog,
    draw,
    field,
    host,
    labelled,
    MILL,
    must,
    press,
    PROFILES,
    PULSE,
    RAJA,
    setUp,
    submit,
    tearDown,
    text,
    type,
    YOGA,
} from "./test-kit";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push, replace: vi.fn() }),
    usePathname: () => "/account/billing-profiles/bp_pulse",
}));
const actions = vi.hoisted(() => ({
    updateProfileAction: vi.fn(),
    createProfileAction: vi.fn(),
    moveBusinessAction: vi.fn(),
    cancelMoveAction: vi.fn(),
    removeProfileAction: vi.fn(),
    retrySyncAction: vi.fn(),
}));
vi.mock("@/lib/billing-profile-actions", () => actions);
const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

beforeEach(() => {
    setUp();
    for (const fn of [
        refresh,
        push,
        ...Object.values(actions),
        ...Object.values(toast),
    ]) {
        fn.mockReset();
    }
});
afterEach(tearDown);

const page = (p = detail(PULSE), showAll = false) =>
    draw(
        <ProfilePage
            profile={p}
            profiles={PROFILES}
            appUrl="https://app.saroh.localhost"
            showAll={showAll}
        />,
    );

describe("the page", () => {
    it("says what it pays for, its details, and why it can't be removed", () => {
        page();
        const t = text(host);
        expect(t).toContain("Billing profiles › Pulse Fitness LLP");
        expect(t).toContain("Linked at Razorpay");
        expect(t).toContain("GSTIN 06AAAAA0000A1Z5 · pays for 2 businesses");
        expect(t).toContain("Pays for");
        expect(t).toContain("Grow · monthly autopay");
        expect(t).toContain("Next charge 21 Nov");
        expect(t).toContain("Next charge 3 Nov");
        expect(t).toContain("On Saroh's invoices");
        expect(t).toContain(
            "Plot 14, Sector 3, HSIIDC, Rohtak, Haryana 124001",
        );
        expect(t).toContain("Invoices go topulsefitness@example.com");
        expect(t).toContain("PhoneNot added");
        expect(
            host.querySelector(
                '[aria-label="Move Pulse Fitness Gurugram to another profile"]',
            ),
        ).toBeTruthy();
        const remove = button("Remove profile…", host);
        expect(remove.hasAttribute("disabled")).toBe(true);
        expect(
            document.getElementById(
                remove.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("Move its 2 businesses to another profile first.");
    });

    it("lists recent invoices with their PDF, then Show all", () => {
        page(
            detail(PULSE, {
                invoiceCount: 6,
                invoices: [
                    {
                        id: "inv_1",
                        number: "SA/26-27/0014",
                        organizationId: "org_rohtak",
                        businessName: "Pulse Fitness Rohtak",
                        issuedAt: "2026-09-22T06:00:00.000Z",
                        currency: "INR",
                        totalPaise: 123400,
                        pdfPath:
                            "/organizations/org_rohtak/billing/invoices/inv_1/pdf",
                    },
                ],
            }),
        );
        const t = text(host);
        expect(t).toContain("Invoices from Saroh to this profile");
        expect(t).toContain("SA/26-27/0014");
        expect(t).toContain("22 Sept");
        expect(button("PDF", host).getAttribute("href")).toBe(
            "/api/saroh-invoices/org_rohtak/inv_1/pdf",
        );
        expect(button("Show all", host).getAttribute("href")).toBe(
            "/account/billing-profiles/bp_pulse?invoices=all",
        );
    });

    it("a profile nothing uses can be removed, after Keep it or Remove profile", async () => {
        page(detail(MILL));
        expect(text(host)).toContain(
            "GSTIN 06BBBBB0000B1Z5 · pays for nothing yet",
        );
        await press(button("Remove profile…", host));
        const d = dialog();
        expect(text(d)).toContain("Remove Old Mill Bakery?");
        expect(text(d)).toContain(
            "No business uses it, so nothing about your billing changes.",
        );
        expect(text(d)).toContain(
            "Invoices Saroh already sent to it stay in your records and keep these details.",
        );
        expect(button("Keep it", d)).toBeTruthy();
        actions.removeProfileAction.mockResolvedValue({
            ok: true,
            data: { removed: true },
        });
        await press(button("Remove profile", d));
        expect(actions.removeProfileAction).toHaveBeenCalledWith("bp_mill");
        expect(push).toHaveBeenCalledWith("/account/billing-profiles");
    });

    it("a profile Razorpay refused says so, with Try again and Check details", async () => {
        page(detail(MILL));
        const card = host.querySelector<HTMLElement>("[data-sync-card=failed]");
        expect(text(card)).toContain("Couldn't link");
        expect(text(card)).toContain(
            "Razorpay didn't accept this profile, so a payment can't name it yet. Check the billing email and phone, then try again.",
        );
        actions.retrySyncAction.mockResolvedValue({
            ok: true,
            data: { sync: "linking", queued: true },
        });
        await press(button("Try again", card));
        expect(actions.retrySyncAction).toHaveBeenCalledWith("bp_mill");
        expect(refresh).toHaveBeenCalled();
        await press(button("Check details", card));
        expect(text(dialog())).toContain("Edit details");
    });

    it("a profile being linked says there is nothing to do", () => {
        page(detail({ ...RAJA, sync: "linking" }));
        expect(text(host)).toContain(
            "Being linked at Razorpay. This takes a minute or two. Nothing for you to do.",
        );
    });
});

describe("Edit details", () => {
    it("names the businesses it changes and says Save for 2 businesses", async () => {
        page();
        await press(button("Edit details", host));
        const d = dialog();
        expect(text(d)).toContain("‹ Pulse Fitness LLP");
        expect(text(d)).toContain(
            "Saroh's next invoice for Pulse Fitness Rohtak and Pulse Fitness Gurugram uses these details. Invoices already sent keep theirs. Razorpay gets the change in the background.",
        );
        expect(button("Save for 2 businesses", d)).toBeTruthy();
    });

    it("says a GSTIN of another state under it, and sends nothing", async () => {
        page();
        await press(button("Edit details", host));
        type(field("GSTIN"), "07AAAAA0000A1Z5");
        await submit();
        expect(text(dialog())).toContain(
            "This GSTIN starts with 07 (Delhi), but the state below is Haryana (06). Change one so they match.",
        );
        expect(field("GSTIN").getAttribute("aria-invalid")).toBe("true");
        expect(actions.updateProfileAction).not.toHaveBeenCalled();
    });

    it("sends only what changed, and refreshes", async () => {
        page();
        await press(button("Edit details", host));
        type(field("City"), "Hisar");
        actions.updateProfileAction.mockResolvedValue({
            ok: true,
            data: { profile: detail(PULSE), businesses: 2 },
        });
        await submit();
        expect(actions.updateProfileAction).toHaveBeenCalledWith("bp_pulse", {
            city: "Hisar",
        });
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Saved. Saroh's next invoice for each of 2 businesses uses it.",
        );
        expect(refresh).toHaveBeenCalled();
    });

    it("puts the API's refusal under the field it names", async () => {
        page();
        await press(button("Edit details", host));
        type(field("Billing email"), "new@example.com");
        actions.updateProfileAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "You already have a billing profile with this email. Use a different billing email for this one.",
            field: "billingEmail",
        });
        await submit();
        expect(text(dialog())).toContain(
            "You already have a billing profile with this email.",
        );
    });
});

describe("Move", () => {
    it("a paid business moves at its next renewal; an unlinked profile can't take it", async () => {
        page();
        await press(labelled("Move Pulse Fitness Gurugram to another profile"));
        const d = dialog();
        const t = text(d);
        expect(t).toContain("Move Pulse Fitness Gurugram");
        expect(t).toContain(
            "Pro · next charge 3 Nov · billed to Pulse Fitness LLP",
        );
        expect(t).toContain("Bill it to");
        expect(t).toContain("Bills it now");
        expect(t).toContain(
            "Couldn't link at Razorpay yet · fix it before moving a paid business here",
        );
        expect(t).toContain("It moves at its next renewal, on 3 Nov.");
        expect(t).toContain(
            "Until then Saroh keeps billing Pulse Fitness LLP. Before 3 Nov, authorise the plan on Raja Ji Dhaba Pvt Ltd. It takes a minute, and nothing is charged twice or missed.",
        );
        const radios = Array.from(must(d).querySelectorAll('[role="radio"]'));
        expect(radios.map((r) => r.hasAttribute("disabled"))).toEqual([
            true,
            false,
            false,
            true,
        ]);
        actions.moveBusinessAction.mockResolvedValue({
            ok: true,
            data: {
                outcome: "scheduled",
                authorise: {
                    at: "2026-11-03T06:00:00.000Z",
                    legalName: "Raja Ji Dhaba Pvt Ltd",
                    authorisationUrl: "https://rzp.example.com/i/abc",
                },
            },
        });
        await press(button("Move at next renewal", d));
        expect(actions.moveBusinessAction).toHaveBeenCalledWith(
            "bp_raja",
            "org_gurugram",
        );
        expect(text(dialog())).toContain("Authorise the payment");
        expect(button("Authorise payment", dialog()).getAttribute("href")).toBe(
            "https://rzp.example.com/i/abc",
        );
    });

    it("a free business moves now", async () => {
        page(detail(ASHA));
        await press(labelled("Move Yoga Corner to another profile"));
        const d = dialog();
        expect(text(d)).toContain("Free · billed to Asha Verma");
        expect(text(d)).toContain(
            "It moves now. Yoga Corner is on Free, so there's nothing to charge. When it moves to a paid plan, Saroh bills Pulse Fitness LLP.",
        );
        actions.moveBusinessAction.mockResolvedValue({
            ok: true,
            data: { outcome: "applied", authorise: null },
        });
        await press(button("Move now", d));
        expect(actions.moveBusinessAction).toHaveBeenCalledWith(
            "bp_pulse",
            YOGA.id,
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Saroh bills Pulse Fitness LLP for Yoga Corner from now on.",
        );
    });

    it("a move waiting for authorisation can be cancelled", async () => {
        const waiting = {
            ...PULSE,
            payingFor: [
                {
                    ...must(PULSE.payingFor[1]),
                    pendingMove: {
                        toProfileId: "bp_raja",
                        toLegalName: "Raja Ji Dhaba Pvt Ltd",
                        at: "2026-11-03T06:00:00.000Z",
                        authorised: false,
                    },
                },
            ],
        };
        page(detail(waiting));
        expect(text(host)).toContain(
            "Moves to Raja Ji Dhaba Pvt Ltd on 3 Nov, once its payment is authorised.",
        );
        actions.cancelMoveAction.mockResolvedValue({
            ok: true,
            data: { outcome: "kept" },
        });
        await press(button("Cancel move", host));
        expect(actions.cancelMoveAction).toHaveBeenCalledWith(
            "bp_pulse",
            "org_gurugram",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "The move to Raja Ji Dhaba Pvt Ltd is cancelled. Saroh keeps billing Pulse Fitness LLP.",
        );
    });
});
