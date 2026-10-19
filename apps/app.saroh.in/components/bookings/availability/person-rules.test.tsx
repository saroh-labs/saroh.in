// @vitest-environment jsdom
/**
 * Each person's own booking rules on Hours and time off (U20, #1038,
 * DEC-170), at a phone's width and a desk's: "Booking rules for ‹person›"
 * between Time off and More, its sheet with "Same as the business" first
 * in each rule, a Member's change applying with Undo or waiting with
 * Withdraw, someone else's rules only read, the owner's request line with
 * Approve and Turn down (an optional reason), a turn-down as the Member
 * reads it, the business's approval switch and its Gap between bookings,
 * and a refused save put back with the API's sentence.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { router, actions, toast } = vi.hoisted(() => ({
    router: { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() },
    actions: {
        addClosure: vi.fn(),
        addExtraHours: vi.fn(),
        addMyself: vi.fn(),
        addPerson: vi.fn(),
        addTimeOff: vi.fn(),
        previewOff: vi.fn(),
        readOffered: vi.fn(),
        removeClosures: vi.fn(),
        removeExtraHours: vi.fn(),
        removeTimeOffMany: vi.fn(),
        replaceStaffHours: vi.fn(),
        updateBookingRules: vi.fn(),
        updateStaff: vi.fn(),
        updatePersonRules: vi.fn(),
        approveRuleRequest: vi.fn(),
        turnDownRuleRequest: vi.fn(),
        withdrawRuleRequest: vi.fn(),
        dismissRuleRequest: vi.fn(),
    },
    toast: {
        dismissToast: vi.fn(),
        showError: vi.fn(),
        showSuccess: vi.fn(),
        showUndo: vi.fn(() => "toast"),
        showWarning: vi.fn(),
    },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/staff/actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);

import type {
    BookingRules,
    PersonRules,
    PersonRulesView,
    RuleRequest,
    StaffView,
} from "@/lib/staff/types";

import type { EditorProps } from "./hours.test-kit";
import {
    ARJUN,
    MEERA,
    NEHA,
    RULES,
    button,
    dialog,
    drawEditor,
    hasButton,
    press,
    radio,
    said,
    setWidth,
    settle,
} from "./hours.test-kit";
import type { PersonRulesData } from "./use-person-rules";
import { MEMBER_LINE } from "./whose-hours";

const SAME: PersonRules = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    freeCancelHours: null,
    gapMinutes: null,
};
const APPROVAL: BookingRules = {
    ...RULES,
    memberRuleChangesNeedApproval: true,
};

/** Meera with a sign-in: the Member signed in, on her own diary. */
const MEERA_ME: StaffView = {
    ...MEERA,
    membership: {
        id: "m_meera",
        userId: "u_meera",
        name: "Meera Iyer",
        email: "meera@example.com",
    },
    rules: SAME,
};

const request = (over: Partial<RuleRequest> = {}): RuleRequest => ({
    id: "rq_1",
    staffId: "st_arjun",
    staffName: "Arjun Rao",
    status: "WAITING",
    changes: { latestBookingMinutes: 720 },
    words: ["Booking late: up to 12 hours before the start"],
    reason: null,
    requestedBy: { userId: "u_arjun", name: "Arjun Rao" },
    createdAt: "2026-10-19T05:35:00.000Z",
    decidedAt: null,
    decidedBy: null,
    ...over,
});

const view = (
    own: PersonRules,
    req: RuleRequest | null = null,
): PersonRulesView => ({
    staffId: "st_meera",
    name: "Meera Iyer",
    own,
    business: {
        bookAheadDays: 28,
        latestBookingMinutes: 120,
        freeCancelHours: 24,
        gapMinutes: 0,
    },
    effective: {
        bookAheadDays: own.bookAheadDays ?? 28,
        latestBookingMinutes: own.latestBookingMinutes ?? 120,
        freeCancelHours: own.freeCancelHours ?? 24,
        gapMinutes: own.gapMinutes ?? 0,
    },
    canChange: true,
    needsApproval: true,
    request: req,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const m of [
        ...Object.values(actions),
        ...Object.values(toast),
        ...Object.values(router),
    ]) {
        m.mockReset();
    }
    toast.showUndo.mockReturnValue("toast");
    actions.readOffered.mockResolvedValue({ ok: false, why: "failed" });
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const lastUndo = () => {
    const call = toast.showUndo.mock.calls.at(-1) as unknown as
        [string, () => Promise<unknown>] | undefined;
    if (!call) throw new Error("No Undo toast");
    return { words: call[0], undo: call[1] };
};

/** The section between Time off and More. */
const section = () =>
    host.querySelector<HTMLElement>("[data-slot=person-rules]");

/** The keyboard's place, read as its words. */
const focused = () => document.activeElement?.id ?? "";

describe.each([
    ["phone", true],
    ["desk", false],
])("Each person's booking rules, on a %s", (_size, phone) => {
    beforeEach(() => setWidth(phone));

    const owner = (over: Partial<EditorProps> = {}) =>
        drawEditor(root, {
            staff: [{ ...MEERA, rules: SAME }, { ...ARJUN, rules: SAME }, NEHA],
            rules: APPROVAL,
            personRules: { meId: "u_owner", requests: [], mine: null },
            ...over,
        });

    const member = (
        mine: PersonRulesView | null = view(SAME),
        over: Partial<EditorProps> = {},
    ) =>
        drawEditor(root, {
            staff: [MEERA_ME, { ...ARJUN, rules: SAME }, NEHA],
            rules: APPROVAL,
            canEdit: true,
            canManage: false,
            personRules: { meId: "u_meera", requests: null, mine },
            ...over,
        });

    it("says whose rules they are and that they are the business's", () => {
        owner();
        const s = said(section());
        expect(s).toContain("Booking rules for Meera");
        expect(s).toContain("Same as the business");
        expect(s).toContain("Notice, booking ahead, gaps and cancelling");
        expect(s).toContain("Change");
    });

    it("counts the rules just for them", () => {
        owner({
            staff: [
                { ...MEERA, rules: { ...SAME, gapMinutes: 15 } },
                ARJUN,
                NEHA,
            ],
        });
        const s = said(section());
        expect(s).toContain("1 rule just for Meera");
        expect(s).toContain("The rest are the same as the business");
    });

    it("lists the four timing rules, whose each is, and leaves paying and refunds to the business", async () => {
        owner({
            staff: [
                { ...MEERA, rules: { ...SAME, gapMinutes: 15 } },
                ARJUN,
                NEHA,
            ],
        });
        await press(button(/^1 rule just for Meera/));
        const d = said(dialog());
        expect(d).toContain("Booking rules for Meera");
        expect(d).toContain(
            "They replace the business's rules for Meera. Same as the business unless you change one.",
        );
        const rows = Array.from(
            dialog()?.querySelectorAll("[data-person-rule]") ?? [],
        ).map((el) => [el.getAttribute("data-person-rule"), said(el)]);
        expect(rows).toEqual([
            ["latestBookingMinutes", "Up to 2 hours before the start"],
            ["bookAheadDays", "Up to 4 weeks ahead"],
            ["gapMinutes", "15 min between bookings"],
            ["freeCancelHours", "Free to cancel up to 24 hours before"],
        ]);
        expect(d).toContain("Just for Meera");
        expect(d).toContain(
            "How customers pay and refunds are the same for everyone · set in the business's Booking rules.",
        );
        expect(d).not.toContain("Paying");
        expect(d).toContain("Saves as soon as you pick, with Undo.");
    });

    it("offers Same as the business first, with the business's rule under it", async () => {
        owner();
        await press(button(/^Same as the business\. /));
        await press(button(/^Booking late:/));
        const d = dialog();
        expect(said(d)).toContain(
            "Meera's rule · the business's is “Up to 2 hours before the start”",
        );
        const choices = Array.from(
            d?.querySelectorAll("[role=radio]") ?? [],
        ).map((r) => said(r.closest("label")));
        expect(choices[0]).toBe(
            "Same as the businessUp to 2 hours before the start",
        );
        expect(choices.slice(1)).toEqual([
            "Up to 1 hour before the startJust for Meera",
            "Up to 12 hours before the startJust for Meera",
            "Up to 1 day before the startJust for Meera",
        ]);
        expect(radio("Same as the business").getAttribute("aria-checked")).toBe(
            "true",
        );
        // One tab stop for the set, named for whose rule it is.
        expect(
            d?.querySelector("[role=radiogroup]")?.getAttribute("aria-label"),
        ).toBe("Booking late for Meera");
    });

    it("an owner's change applies at once, with Undo sending back only that rule", async () => {
        owner();
        actions.updatePersonRules.mockResolvedValue({
            ok: true,
            data: {
                applied: true,
                previous: SAME,
                rules: view({ ...SAME, latestBookingMinutes: 720 }),
            },
        });
        await press(button(/^Same as the business\. /));
        await press(button(/^Booking late:/));
        await press(radio("Up to 12 hours before the start"));
        await settle();
        expect(actions.updatePersonRules).toHaveBeenCalledWith("st_meera", {
            latestBookingMinutes: 720,
        });
        expect(lastUndo().words).toBe(
            "Booking late for Meera: up to 12 hours before the start. Saved.",
        );
        // Back on her rules, which say so at once.
        expect(said(dialog())).toContain("Booking rules for Meera");
        expect(said(dialog())).toContain("Up to 12 hours before the start");
        actions.updatePersonRules.mockResolvedValue({
            ok: true,
            data: { applied: true, previous: SAME, rules: view(SAME) },
        });
        await act(async () => {
            await lastUndo().undo();
        });
        // Only the rule it changed: a later change to another stays.
        expect(actions.updatePersonRules).toHaveBeenLastCalledWith("st_meera", {
            latestBookingMinutes: SAME.latestBookingMinutes,
        });
    });

    it("a second change takes the first one's Undo away", async () => {
        owner();
        actions.updatePersonRules.mockResolvedValue({
            ok: true,
            data: {
                applied: true,
                previous: SAME,
                rules: view({ ...SAME, latestBookingMinutes: 720 }),
            },
        });
        await press(button(/^Same as the business\. /));
        await press(button(/^Booking late:/));
        await press(radio("Up to 12 hours before the start"));
        await settle();
        expect(toast.dismissToast).not.toHaveBeenCalled();
        await press(button(/^Booking late:/));
        await press(radio("Up to 1 hour before the start"));
        await settle();
        expect(toast.dismissToast).toHaveBeenCalledWith("toast");
    });

    it("a Member's own change applies at once with Undo while approval is off", async () => {
        member(view(SAME), {
            rules: { ...RULES, memberRuleChangesNeedApproval: false },
        });
        actions.updatePersonRules.mockResolvedValue({
            ok: true,
            data: {
                applied: true,
                previous: SAME,
                rules: view({ ...SAME, gapMinutes: 15 }),
            },
        });
        await press(button(/^Same as the business\. /));
        expect(said(dialog())).toContain(
            "Saves as soon as you pick, with Undo.",
        );
        await press(button(/^Gap between bookings:/));
        await press(radio("15 min between bookings"));
        await settle();
        expect(actions.updatePersonRules).toHaveBeenCalledWith("st_meera", {
            gapMinutes: 15,
        });
        expect(lastUndo().words).toBe(
            "Gap between bookings for Meera: 15 min between bookings. Saved.",
        );
    });

    it("a Member's own change waits for approval, and Withdraw takes it back", async () => {
        member();
        const waiting = request({
            staffId: "st_meera",
            staffName: "Meera Iyer",
            requestedBy: { userId: "u_meera", name: "Meera Iyer" },
        });
        actions.updatePersonRules.mockResolvedValue({
            ok: true,
            data: {
                applied: false,
                previous: SAME,
                rules: view(SAME, waiting),
            },
        });
        await press(button(/^Same as the business\. /));
        expect(said(dialog())).toContain(
            "An owner or admin approves your change before it applies. Until then your rules stay as they are.",
        );
        await press(button(/^Booking late:/));
        await press(radio("Up to 12 hours before the start"));
        await settle();
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(dialog()).toBeNull();
        const s = said(section());
        expect(s).toContain(
            "Waiting for approval · sent to owners and admins.",
        );
        expect(s).toContain(
            "Booking late: up to 12 hours before the start. Now: up to 2 hours before the start, the same as the business.",
        );
        // Nothing changed yet: her rules are still the business's.
        expect(s).toContain("Same as the business");
        expect(focused()).toBe("person-rules-row");

        actions.withdrawRuleRequest.mockResolvedValue({
            ok: true,
            data: { ...waiting, status: "WITHDRAWN" },
        });
        await press(button("Withdraw the request"));
        await settle();
        expect(actions.withdrawRuleRequest).toHaveBeenCalledWith("rq_1");
        expect(said(section())).not.toContain("Waiting for approval");
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Request withdrawn.",
            "Nothing changed.",
        );
    });

    it("shows a Member someone else's rules to read, and who can change them", async () => {
        member();
        act(() => {
            root.unmount();
            root = createRoot(host);
        });
        member(view(SAME), { person: "st_arjun" });
        const s = said(section());
        expect(s).toContain("Booking rules for Arjun");
        expect(s).toContain("See them");
        expect(s).toContain(
            "Only an owner or admin can change Arjun's booking rules.",
        );
        await press(button(/^Same as the business\. /));
        expect(hasButton(/^Booking late:/, dialog() ?? undefined)).toBe(false);
        expect(said(dialog())).toContain(
            "Only an owner or admin can change these.",
        );
    });

    it("names a person with a sign-in as one who can change their own", () => {
        member(view(SAME), {
            person: "st_arjun",
            staff: [
                MEERA_ME,
                {
                    ...ARJUN,
                    rules: SAME,
                    membership: {
                        id: "m_arjun",
                        userId: "u_arjun",
                        name: "Arjun Rao",
                        email: "arjun@example.com",
                    },
                },
            ],
        });
        expect(said(section())).toContain(
            "Only Arjun or an owner or admin can change Arjun's booking rules.",
        );
    });

    it("tells a Member what front desk can change, their own rules included", () => {
        member();
        expect(MEMBER_LINE).toContain("and your own booking rules");
        expect(said(host)).toContain(MEMBER_LINE);
    });

    it("on Everyone, shows your own rules; an owner with no diary sees none", () => {
        member(view(SAME), { person: "all" });
        expect(said(section())).toContain("Booking rules for Meera");
        act(() => {
            root.unmount();
            root = createRoot(host);
        });
        owner({ person: "all" });
        expect(section()).toBeNull();
    });

    it("tells owners of a request and approves it", async () => {
        owner({
            personRules: {
                meId: "u_owner",
                requests: [request()],
                mine: null,
            },
        });
        const line = host.querySelector<HTMLElement>("[data-rule-requests]");
        expect(said(line)).toContain(
            "1 request · Arjun wants their own rule: booking late up to 12 hours before the start.",
        );
        await press(button("Review", line ?? undefined));
        const d = said(dialog());
        expect(d).toContain("Arjun's request");
        expect(d).toContain("Sent ");
        expect(d).toContain("you also got a notification");
        expect(d).toContain("Booking late, for Arjun only");
        expect(d).toContain("Up to 12 hours before the start");
        expect(d).toContain(
            "Up to 2 hours before the start · same as the business",
        );
        expect(d).toContain(
            "If you approve, customers can't book Arjun with less than 12 hours' notice. Bookings already made stay. Arjun is told either way.",
        );
        actions.approveRuleRequest.mockResolvedValue({
            ok: true,
            data: request({ status: "APPROVED" }),
        });
        await press(button("Approve"));
        await settle();
        expect(actions.approveRuleRequest).toHaveBeenCalledWith("rq_1");
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Request approved.",
            "Arjun's bookings now need 12 hours' notice. Arjun is told.",
        );
        expect(host.querySelector("[data-rule-requests]")).toBeNull();
        expect(dialog()).toBeNull();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("turns a request down with a reason the Member reads, or none", async () => {
        owner({
            personRules: {
                meId: "u_owner",
                requests: [request(), request({ id: "rq_2" })],
                mine: null,
            },
        });
        expect(said(host)).toContain(
            "2 requests · Arjun want changes to their own rules.",
        );
        await press(button("Review"));
        await press(button("Turn down"));
        expect(said(dialog())).toContain("Turn down Arjun's request?");
        expect(said(dialog())).toContain(
            "Arjun's rule stays the same as the business.",
        );
        expect(said(dialog())).toContain("Reason");
        expect(said(dialog())).toContain("(optional)");
        expect(said(dialog())).toContain("Arjun sees it.");
        const box = dialog()?.querySelector("textarea");
        if (!box) throw new Error("No reason box");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            )?.set?.call(box, "Ask again in November.");
            box.dispatchEvent(new Event("input", { bubbles: true }));
        });
        actions.turnDownRuleRequest.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again.",
        });
        const turnDown = Array.from(
            dialog()?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent.trim() === "Turn down");
        if (!turnDown) throw new Error("No Turn down");
        await press(turnDown);
        await settle();
        // Refused: it says so, and what was typed stays.
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't turn down the request.",
            "That didn't go through. Try again.",
        );
        expect(dialog()?.querySelector("textarea")?.value).toBe(
            "Ask again in November.",
        );
        actions.turnDownRuleRequest.mockResolvedValue({
            ok: true,
            data: request({ status: "TURNED_DOWN" }),
        });
        await press(turnDown);
        await settle();
        expect(actions.turnDownRuleRequest).toHaveBeenLastCalledWith(
            "rq_1",
            "Ask again in November.",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Request turned down.",
            "Arjun sees your reason.",
        );
        // The next one is still waiting.
        expect(said(host)).toContain("1 request · Arjun wants");

        await press(button("Review"));
        await press(button("Turn down"));
        actions.turnDownRuleRequest.mockResolvedValue({
            ok: true,
            data: request({ id: "rq_2", status: "TURNED_DOWN" }),
        });
        const again = Array.from(
            dialog()?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent.trim() === "Turn down");
        if (!again) throw new Error("No Turn down");
        await press(again);
        await settle();
        expect(actions.turnDownRuleRequest).toHaveBeenLastCalledWith(
            "rq_2",
            undefined,
        );
        expect(toast.showSuccess).toHaveBeenLastCalledWith(
            "Request turned down.",
            "Arjun is told.",
        );
    });

    it("shows a Member their turn-down with the reason; OK clears it", async () => {
        const down = request({
            staffId: "st_meera",
            staffName: "Meera Iyer",
            status: "TURNED_DOWN",
            reason: "We need same-day bookings in the Diwali weeks.",
            decidedBy: { userId: "u_owner", name: "Mohit Mehta" },
        });
        member(view(SAME, down));
        const s = said(section());
        expect(s).toContain(
            "Turned down by Mohit · Booking late up to 12 hours before the start. Your rule stays the same as the business.",
        );
        expect(s).toContain("“We need same-day bookings in the Diwali weeks.”");
        actions.dismissRuleRequest.mockResolvedValue({ ok: true, data: down });
        await press(button("OK"));
        await settle();
        expect(actions.dismissRuleRequest).toHaveBeenCalledWith("rq_1");
        expect(said(section())).not.toContain("Turned down");
    });

    it("Change it again clears the turn-down and opens the rule it was about", async () => {
        const down = request({
            staffId: "st_meera",
            staffName: "Meera Iyer",
            status: "TURNED_DOWN",
        });
        member(view(SAME, down));
        expect(said(section())).toContain("No reason was given.");
        actions.dismissRuleRequest.mockResolvedValue({ ok: true, data: down });
        await press(button("Change it again"));
        await settle();
        expect(actions.dismissRuleRequest).toHaveBeenCalledWith("rq_1");
        expect(said(dialog())).toContain(
            "Meera's rule · the business's is “Up to 2 hours before the start”",
        );
    });

    it("puts a refused save back, with the API's sentence", async () => {
        owner();
        actions.updatePersonRules.mockResolvedValue({
            ok: false,
            error: "Your role can't change booking rules.",
        });
        await press(button(/^Same as the business\. /));
        await press(button(/^Booking late:/));
        await press(radio("Up to 12 hours before the start"));
        await settle();
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save that rule. Nothing has changed.",
            "Your role can't change booking rules.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(radio("Same as the business").getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("keeps a refused approval open, saying why", async () => {
        owner({
            personRules: {
                meId: "u_owner",
                requests: [request()],
                mine: null,
            },
        });
        actions.approveRuleRequest.mockResolvedValue({
            ok: false,
            error: "This request was already withdrawn.",
        });
        await press(button("Review"));
        await press(button("Approve"));
        await settle();
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't approve the request.",
            "This request was already withdrawn.",
        );
        expect(said(dialog())).toContain("Arjun's request");
    });

    it("gives owners the approval switch beside the business's rules, with Undo", async () => {
        owner();
        actions.updateBookingRules.mockResolvedValue({
            ok: true,
            data: { ...APPROVAL, memberRuleChangesNeedApproval: false },
        });
        await press(button(/^Booking rules, Whole business/));
        const d = dialog();
        const sw = d?.querySelector<HTMLElement>("[role=switch]");
        expect(sw?.getAttribute("aria-checked")).toBe("true");
        expect(said(d)).toContain("Members' rule changes need approval");
        expect(said(d)).toContain(
            "On: a Member's change to their own rules waits until an owner or admin approves it.",
        );
        expect(said(d)).toContain("On for every new business.");
        if (!sw) throw new Error("No switch");
        await press(sw);
        await settle();
        expect(actions.updateBookingRules).toHaveBeenCalledWith({
            memberRuleChangesNeedApproval: false,
        });
        expect(lastUndo().words).toBe(
            "Members' rule changes now apply at once. Saved.",
        );
        expect(
            dialog()
                ?.querySelector("[role=switch]")
                ?.getAttribute("aria-checked"),
        ).toBe("false");
    });

    it("keeps the switch from a Member, and points to their own rules", async () => {
        member();
        await press(button(/^Booking rules, Whole business/));
        const d = dialog();
        expect(d?.querySelector("[role=switch]")).toBeNull();
        expect(said(d)).toContain(
            "Only owners and admins change the business's rules. Your own rules are under Booking rules for Meera.",
        );
    });

    it("sets the business-wide Gap between bookings", async () => {
        owner();
        actions.updateBookingRules.mockResolvedValue({
            ok: true,
            data: { ...APPROVAL, gapMinutes: 15 },
        });
        await press(button(/^Booking rules, Whole business/));
        await press(button(/^Gap between bookings: No gap needed/));
        await press(radio("15 min between bookings"));
        await settle();
        expect(actions.updateBookingRules).toHaveBeenCalledWith({
            gapMinutes: 15,
        });
        expect(lastUndo().words).toBe(
            "Gap between bookings: 15 min between bookings. Saved.",
        );
    });

    it.each([
        ["Reviewer", "u_meera"],
        ["Calendar only", "u_meera"],
    ])("lets a %s only read their own rules", async (_role, meId) => {
        drawEditor(root, {
            staff: [MEERA_ME, NEHA],
            rules: APPROVAL,
            canEdit: false,
            canManage: false,
            personRules: { meId, requests: null, mine: view(SAME) },
        });
        const s = said(section());
        expect(s).toContain("See them");
        expect(s).toContain(
            "Your role can't change booking rules. An owner or admin can.",
        );
        await press(button(/^Same as the business\. /));
        expect(hasButton(/^Booking late:/, dialog() ?? undefined)).toBe(false);
    });

    it("still draws the rules when the requests couldn't be read", () => {
        const data: PersonRulesData = {
            meId: "u_owner",
            requests: null,
            mine: null,
        };
        owner({ personRules: data });
        expect(host.querySelector("[data-rule-requests]")).toBeNull();
        expect(said(section())).toContain("Booking rules for Meera");
    });
});
