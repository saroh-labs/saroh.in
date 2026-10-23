/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    LeadsBoard as Board,
    LeadCard,
    LeadDetail,
    LeadStage,
} from "@/lib/saroh-lead-words";
import { followUpWords, stageMoveProblem } from "@/lib/saroh-lead-words";

const actions = vi.hoisted(() => ({
    readLeadAction: vi.fn(),
    wonCandidatesAction: vi.fn(),
    leadManagersAction: vi.fn(),
    addLeadAction: vi.fn(),
    updateLeadAction: vi.fn(),
    moveLeadStageAction: vi.fn(),
    assignLeadAction: vi.fn(),
    logLeadContactAction: vi.fn(),
}));
vi.mock("@/lib/saroh-lead-actions", () => actions);

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const router = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/leads",
    useSearchParams: () => new URLSearchParams(),
}));

import { LeadsBoard } from "./leads-board";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const TODAY = "2026-10-19";
const PRIYA = { platformAdminId: "pa_priya", name: "Priya Sharma" };

function card(over: Partial<LeadCard> = {}): LeadCard {
    return {
        id: "lead_1",
        name: "Green Leaf Gym",
        email: "green.leaf@example.com",
        phone: null,
        city: "Rohtak",
        kind: "gym",
        source: "WEBSITE",
        stage: "NEW",
        stagedAt: "2026-10-18T10:00:00.000Z",
        followUpOn: null,
        overdue: false,
        owner: PRIYA,
        ownedHow: "ASSIGNED",
        lastContactAt: null,
        createdAt: "2026-10-18T10:00:00.000Z",
        ...over,
    };
}

function detail(over: Partial<LeadDetail> = {}): LeadDetail {
    return {
        ...card(),
        signUpEmail: null,
        emailAt: "2026-10-18T10:00:00.000Z",
        notes: null,
        wonOrganization: null,
        wonAt: null,
        lostReason: null,
        ownerSince: "2026-10-18T10:00:00.000Z",
        websiteSeenAt: "2026-10-18T10:00:00.000Z",
        log: [],
        mayAssign: false,
        mayWrite: true,
        ...over,
    };
}

function counts(leads: LeadCard[]): Record<LeadStage, number> {
    const all = { NEW: 0, TALKED: 0, DEMO: 0, TRIAL: 0, WON: 0, LOST: 0 };
    for (const lead of leads) all[lead.stage] += 1;
    return all;
}

function board(leads: LeadCard[], over: Partial<Board> = {}): Board {
    return {
        scope: "own",
        today: TODAY,
        leads,
        truncated: false,
        counts: counts(leads),
        overdue: leads.filter((lead) => lead.overdue).length,
        unowned: null,
        mayAssign: false,
        ...over,
    };
}

function show(
    leads: LeadCard[],
    over: Partial<Board> = {},
    props: { owner?: "all" | "unowned"; q?: string; canWrite?: boolean } = {},
) {
    return render(
        <LeadsBoard
            board={board(leads, over)}
            owner={props.owner ?? "all"}
            q={props.q ?? ""}
            canWrite={props.canWrite ?? true}
        />,
    );
}

const column = (stage: LeadStage) => {
    const found = document.querySelector<HTMLElement>(
        `[data-stage="${stage}"]`,
    );
    if (!found) throw new Error(`no ${stage} column`);
    return found;
};

async function openLead(name: string, lead: LeadDetail) {
    actions.readLeadAction.mockResolvedValue({ ok: true, data: lead });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    const dialog = await screen.findByRole("dialog");
    // Read when it opens: wait for the lead, not the loading lines.
    await within(dialog).findByRole("heading", { name: lead.name });
    return dialog;
}

describe("LeadsBoard", () => {
    it("shows a column per stage with its count, each lead in its stage", () => {
        show([
            card(),
            card({ id: "lead_2", name: "City Physio", stage: "TALKED" }),
            card({ id: "lead_3", name: "Leafy Cafe", stage: "WON" }),
        ]);
        expect(
            screen.getByRole("region", { name: "New · 1 lead" }),
        ).toBeTruthy();
        expect(within(column("TALKED")).getByText("City Physio")).toBeTruthy();
        expect(within(column("WON")).getByText("Leafy Cafe")).toBeTruthy();
        expect(within(column("DEMO")).getByText("None here.")).toBeTruthy();
        expect(
            within(column("NEW")).getByText("Enquiry · gym · Rohtak"),
        ).toBeTruthy();
    });

    it("counts and marks overdue follow-ups", () => {
        show([
            card({ followUpOn: "2026-10-15", overdue: true }),
            card({ id: "lead_2", name: "Later", followUpOn: "2026-10-24" }),
        ]);
        const overdue = screen.getByText("Follow-ups overdue").parentElement;
        expect(overdue?.textContent).toContain("1");
        expect(screen.getByText("Overdue by 4 days")).toBeTruthy();
        expect(screen.getByText("Follow up 24 Oct")).toBeTruthy();
    });

    it("shows an empty board's first-run card", () => {
        show([]);
        expect(screen.getByText("No leads yet")).toBeTruthy();
        expect(document.querySelector("[data-board]")).toBeNull();
    });

    it("says nothing matched a search, with the way back", () => {
        show([], {}, { q: "zebra" });
        expect(screen.queryByText("No leads yet")).toBeNull();
        expect(screen.getByText(/zebra/)).toBeTruthy();
    });

    it("on a phone shows one stage at a time, picked above the board", () => {
        show([
            card(),
            card({ id: "lead_2", name: "City Physio", stage: "TALKED" }),
        ]);
        expect(column("NEW").className).not.toContain("max-md:hidden");
        expect(column("TALKED").className).toContain("max-md:hidden");

        const picker = screen.getByRole("radiogroup", {
            name: "Stage to show",
        });
        fireEvent.click(within(picker).getByRole("radio", { name: /Talked/ }));
        expect(column("TALKED").className).not.toContain("max-md:hidden");
        expect(column("NEW").className).toContain("max-md:hidden");
        expect(document.querySelectorAll("[data-phone-shown]").length).toBe(1);
    });

    it("gives an Account manager no 'Not given out' filter", () => {
        show([card()]);
        expect(document.querySelector("[data-attention-toggle]")).toBeNull();
    });

    it("lets Support show only leads nobody has", () => {
        show([card({ owner: null, ownedHow: null })], {
            scope: "all",
            unowned: 3,
            mayAssign: true,
        });
        const toggle = screen.getByRole("button", {
            name: /Not given out/,
            pressed: false,
        });
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(toggle);
        expect(router.push).toHaveBeenCalledWith("/leads?owner=unowned", {
            scroll: false,
        });
    });

    it("hides Add a lead without the write permission", () => {
        show([card()], {}, { canWrite: false });
        expect(screen.queryByRole("button", { name: "Add a lead" })).toBeNull();
    });
});

describe("LeadSheet › Stage", () => {
    it("moves a lead by keyboard: arrows pick the stage, the button moves it", async () => {
        show([card()]);
        const dialog = await openLead("Green Leaf Gym", detail());
        const stage = within(dialog).getByRole("radiogroup", { name: "Stage" });
        const current = within(stage).getByRole("radio", { name: "New" });
        expect(current.getAttribute("aria-checked")).toBe("true");
        expect(current.getAttribute("tabindex")).toBe("0");

        current.focus();
        fireEvent.keyDown(current, { key: "ArrowRight" });
        const talked = within(stage).getByRole("radio", { name: "Talked" });
        expect(talked.getAttribute("aria-checked")).toBe("true");
        expect(document.activeElement).toBe(talked);

        actions.moveLeadStageAction.mockResolvedValue({
            ok: true,
            data: card({ stage: "TALKED" }),
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Move to Talked" }),
        );
        await waitFor(() =>
            expect(actions.moveLeadStageAction).toHaveBeenCalledWith(
                expect.objectContaining({ id: "lead_1", stage: "TALKED" }),
            ),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Green Leaf Gym moved to Talked.",
                expect.any(String),
            ),
        );
        expect(
            within(column("TALKED")).getByText("Green Leaf Gym"),
        ).toBeTruthy();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("asks which business for Won, and writes nothing without one", async () => {
        actions.wonCandidatesAction.mockResolvedValue({ ok: true, data: [] });
        show([card()]);
        const dialog = await openLead("Green Leaf Gym", detail());
        const stage = within(dialog).getByRole("radiogroup", { name: "Stage" });
        fireEvent.click(within(stage).getByRole("radio", { name: "Won" }));
        await waitFor(() =>
            expect(actions.wonCandidatesAction).toHaveBeenCalledWith("lead_1"),
        );
        expect(within(dialog).getByText("The business it became")).toBeTruthy();
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Move to Won" }),
        );
        expect(
            await within(dialog).findByText(
                "Pick the business this lead became.",
            ),
        ).toBeTruthy();
        expect(actions.moveLeadStageAction).not.toHaveBeenCalled();
    });

    it("asks why for Lost", async () => {
        show([card()]);
        const dialog = await openLead("Green Leaf Gym", detail());
        const stage = within(dialog).getByRole("radiogroup", { name: "Stage" });
        fireEvent.click(within(stage).getByRole("radio", { name: "Lost" }));
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Move to Lost" }),
        );
        expect(
            await within(dialog).findByText("Say why it was lost."),
        ).toBeTruthy();
        expect(actions.moveLeadStageAction).not.toHaveBeenCalled();

        fireEvent.change(within(dialog).getByLabelText("Why it was lost"), {
            target: { value: "Went with a spreadsheet" },
        });
        actions.moveLeadStageAction.mockResolvedValue({
            ok: true,
            data: card({ stage: "LOST" }),
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Move to Lost" }),
        );
        await waitFor(() =>
            expect(actions.moveLeadStageAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    stage: "LOST",
                    lostReason: "Went with a spreadsheet",
                }),
            ),
        );
    });

    it("says why the API refused another manager's lead", async () => {
        show([card()]);
        actions.readLeadAction.mockResolvedValue({
            ok: false,
            error: "That lead isn't one of yours.",
            status: 403,
        });
        fireEvent.click(screen.getByRole("button", { name: /Green Leaf Gym/ }));
        const dialog = await screen.findByRole("dialog");
        expect(
            await within(dialog).findByText("That lead isn't one of yours."),
        ).toBeTruthy();
    });

    it("offers Give to a manager only on an unowned lead to staff who give leads out", async () => {
        actions.leadManagersAction.mockResolvedValue({
            ok: true,
            data: [{ ...PRIYA, openLeads: 4 }],
        });
        show([card({ owner: null, ownedHow: null })], {
            scope: "all",
            unowned: 1,
            mayAssign: true,
        });
        const dialog = await openLead(
            "Green Leaf Gym",
            detail({ owner: null, ownedHow: null, mayAssign: true }),
        );
        expect(
            within(dialog).getByRole("button", { name: "Give to a manager…" }),
        ).toBeTruthy();
        expect(
            within(dialog).getByText("Not given to anyone yet"),
        ).toBeTruthy();
    });

    it("shows an empty log, and Log a call opens its sheet", async () => {
        show([card()]);
        const dialog = await openLead("Green Leaf Gym", detail());
        expect(
            within(dialog).getByText("No calls or visits yet."),
        ).toBeTruthy();
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Log a call" }),
        );
        expect(
            await screen.findByRole("heading", { name: "Log a call" }),
        ).toBeTruthy();
    });
});

describe("AddLeadSheet", () => {
    it("puts 'already a lead, whose' under the email", async () => {
        show([card()]);
        fireEvent.click(screen.getByRole("button", { name: "Add a lead" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Business or person"), {
            target: { value: "Royal Tailors" },
        });
        fireEvent.change(within(dialog).getByLabelText(/^Email/), {
            target: { value: "royal@example.com" },
        });
        actions.addLeadAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "That email is already a lead, Priya Sharma's.",
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Add lead" }),
        );
        expect(
            await within(dialog).findByText(
                "That email is already a lead, Priya Sharma's.",
            ),
        ).toBeTruthy();
    });
});

describe("lead words", () => {
    it.each([
        [
            { stage: "NEW", followUpOn: "2026-10-18", overdue: true },
            "Overdue by 1 day",
        ],
        [
            { stage: "NEW", followUpOn: "2026-10-19", overdue: false },
            "Follow up today",
        ],
        [
            { stage: "DEMO", followUpOn: "2026-10-20", overdue: false },
            "Follow up tomorrow",
        ],
        [{ stage: "WON", followUpOn: "2026-10-01", overdue: false }, null],
        [{ stage: "NEW", followUpOn: null, overdue: false }, null],
    ] as const)("%o reads %s", (lead, words) => {
        expect(followUpWords(lead, TODAY)).toBe(words);
    });

    it("needs a business for Won and a reason for Lost", () => {
        const base = {
            from: "NEW" as const,
            organizationId: "",
            lostReason: "",
        };
        expect(stageMoveProblem({ ...base, to: "WON" })).toMatch(/business/);
        expect(stageMoveProblem({ ...base, to: "LOST" })).toMatch(/why/);
        expect(stageMoveProblem({ ...base, to: "TALKED" })).toBeNull();
    });
});
