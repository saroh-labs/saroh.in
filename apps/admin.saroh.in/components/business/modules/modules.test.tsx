/** @vitest-environment jsdom */
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    BusinessModulesState,
    BusinessModuleState,
} from "@/lib/businesses";
import type { AdminPermission } from "@/lib/control-plane";

import { ModuleRows } from "./module-rows";

const actions = vi.hoisted(() => ({
    moduleReleaseAction: vi.fn(),
    switchOnModuleAction: vi.fn(),
    setModuleAction: vi.fn(),
    repairModulesAction: vi.fn(),
    // The offer sheet (U5) reads its options when it opens.
    offerOptionsAction: vi.fn(() => new Promise(() => undefined)),
    previewOfferAction: vi.fn(),
}));
vi.mock("@/lib/business-actions", () => actions);

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: Record<string, unknown>) => (
        <a href={href as string} {...rest}>
            {children as React.ReactNode}
        </a>
    ),
}));

const row = (over: Partial<BusinessModuleState>): BusinessModuleState => ({
    moduleKey: "CRM",
    label: "CRM",
    state: "on",
    blocker: null,
    reason: null,
    fix: null,
    dependencies: [],
    ...over,
});

const bookingsOff = row({
    moduleKey: "APPOINTMENTS",
    label: "Bookings",
    state: "off",
    blocker: "ROLLOUT_DISABLED",
    reason: "Release off for everyone",
    fix: {
        kind: "release",
        label: "Turn on for this business…",
        permission: "flags:publish",
        flagKey: "module.appointments",
    },
    dependencies: [{ moduleKey: "WEBSITE", label: "Website", on: true }],
});
const bookingsOn = row({
    moduleKey: "APPOINTMENTS",
    label: "Bookings",
    state: "on",
    dependencies: bookingsOff.dependencies,
});
const coursesSwitchedOff = row({
    moduleKey: "COURSES",
    label: "Courses",
    state: "off",
    blocker: "ORG_MODULE_DISABLED",
    reason: "They switched it off",
    fix: {
        kind: "switch-on",
        label: "Switch on for them…",
        permission: "organization:modules:write",
    },
});
const commerceLocked = row({
    moduleKey: "COMMERCE",
    label: "Commerce",
    state: "locked",
    blocker: "ENTITLEMENT_REQUIRED",
    reason: "Not in their plan",
    fix: {
        kind: "plan",
        label: "Change plan or give the module…",
        permission: "pricing:override",
    },
});

const state = (
    modules: BusinessModuleState[],
    note: string | null = "Plan limits not enforced yet",
): BusinessModulesState => ({
    organizationId: "org_1",
    planLimitsEnforced: note === null,
    note,
    modules,
});

const ALL: AdminPermission[] = [
    "flags:publish",
    "organization:modules:write",
    "pricing:override",
];

function renderRows(
    modules: BusinessModuleState[],
    permissions: AdminPermission[] = ALL,
    extra: Partial<Parameters<typeof ModuleRows>[0]> = {},
) {
    return render(
        <ModuleRows
            organizationId="org_1"
            businessName="Rye & Co."
            state={state(modules)}
            permissions={permissions}
            {...extra}
        />,
    );
}

function rowOf(key: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(`[data-module="${key}"]`);
    if (!el) throw new Error(`No row for ${key}`);
    return el;
}

async function giveReason(text = "Testing on a test business") {
    fireEvent.change(await screen.findByLabelText(/Reason/), {
        target: { value: text },
    });
}

beforeEach(() => {
    for (const fn of [...Object.values(actions), ...Object.values(toast)]) {
        fn.mockReset();
    }
});
afterEach(cleanup);

describe("ModuleRows", () => {
    it("turns a release on for this business with a reason, flips the row, and Undo turns it back off", async () => {
        actions.moduleReleaseAction
            .mockResolvedValueOnce({ ok: true, data: { row: bookingsOn } })
            .mockResolvedValueOnce({ ok: true, data: { row: bookingsOff } });
        renderRows([bookingsOff]);

        const bookings = within(rowOf("APPOINTMENTS"));
        expect(bookings.getByText("Off")).toBeTruthy();
        expect(bookings.getByText("Release off for everyone")).toBeTruthy();

        fireEvent.click(
            bookings.getByRole("button", {
                name: "Turn on for this business…",
            }),
        );
        const dialog = await screen.findByRole("dialog");
        // The gates: the release fails, the rest wait for it.
        const gates = within(dialog).getByRole("list", { name: "Gates" });
        expect(
            gates
                .querySelector('[data-gate="release"]')
                ?.getAttribute("data-status"),
        ).toBe("fail");
        expect(
            gates
                .querySelector('[data-gate="plan"]')
                ?.getAttribute("data-status"),
        ).toBe("later");

        const submit = within(dialog).getByRole("button", {
            name: "Turn on for this business",
        });
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        await giveReason();
        fireEvent.click(submit);

        await waitFor(() =>
            expect(actions.moduleReleaseAction).toHaveBeenCalledWith(
                "org_1",
                "APPOINTMENTS",
                "module.appointments",
                expect.objectContaining({
                    enabled: true,
                    reason: "Testing on a test business",
                    idempotencyKey: expect.any(String) as unknown,
                }),
            ),
        );
        // The row flips to what the API read back, and lights.
        await waitFor(() =>
            expect(within(rowOf("APPOINTMENTS")).getByText("On")).toBeTruthy(),
        );
        expect(rowOf("APPOINTMENTS").hasAttribute("data-just-changed")).toBe(
            true,
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        // Undo: the toast's action turns the release back off.
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Bookings is on for Rye & Co.",
            expect.any(Function),
            expect.anything(),
        );
        const undo = toast.showUndo.mock.calls[0][1] as () => void;
        act(() => {
            undo();
        });
        await waitFor(() =>
            expect(actions.moduleReleaseAction).toHaveBeenLastCalledWith(
                "org_1",
                "APPOINTMENTS",
                "module.appointments",
                expect.objectContaining({
                    enabled: false,
                    reason: "Undo: Testing on a test business",
                }),
            ),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Change undone",
                expect.any(String),
            ),
        );
        expect(within(rowOf("APPOINTMENTS")).getByText("Off")).toBeTruthy();
    });

    it("Undo clears the release for this business when it had none of its own", async () => {
        actions.moduleReleaseAction.mockResolvedValue({
            ok: true,
            data: { row: bookingsOn },
        });
        renderRows([bookingsOff], ALL, {
            priorOverrides: { "module.appointments": null },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Turn on for this business…" }),
        );
        await giveReason();
        fireEvent.click(
            screen.getByRole("button", { name: "Turn on for this business" }),
        );
        await waitFor(() => expect(toast.showUndo).toHaveBeenCalled());
        act(() => {
            (toast.showUndo.mock.calls[0][1] as () => void)();
        });
        await waitFor(() =>
            expect(actions.moduleReleaseAction).toHaveBeenLastCalledWith(
                "org_1",
                "APPOINTMENTS",
                "module.appointments",
                expect.objectContaining({ enabled: null }),
            ),
        );
    });

    it("switches a module on for them with a reason", async () => {
        actions.switchOnModuleAction.mockResolvedValue({
            ok: true,
            data: {
                row: {
                    ...coursesSwitchedOff,
                    state: "on",
                    blocker: null,
                    reason: null,
                    fix: null,
                },
            },
        });
        renderRows([coursesSwitchedOff]);

        fireEvent.click(
            screen.getByRole("button", { name: "Switch on for them…" }),
        );
        const dialog = await screen.findByRole("dialog");
        const gates = within(dialog).getByRole("list", { name: "Gates" });
        expect(
            gates
                .querySelector('[data-gate="release"]')
                ?.getAttribute("data-status"),
        ).toBe("pass");
        expect(
            gates
                .querySelector('[data-gate="switch"]')
                ?.getAttribute("data-status"),
        ).toBe("fail");

        await giveReason("They asked on a call");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Switch on for them" }),
        );
        await waitFor(() =>
            expect(actions.switchOnModuleAction).toHaveBeenCalledWith(
                "org_1",
                "COURSES",
                expect.objectContaining({ reason: "They asked on a call" }),
            ),
        );
        await waitFor(() =>
            expect(within(rowOf("COURSES")).getByText("On")).toBeTruthy(),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Courses is switched on for Rye & Co.",
            expect.any(String),
        );
    });

    it("shows a fix disabled, saying why, without the permission", () => {
        renderRows(
            [bookingsOff, coursesSwitchedOff, commerceLocked],
            ["organization:modules:write"],
        );
        const release = within(rowOf("APPOINTMENTS")).getByRole("button", {
            name: "Turn on for this business…",
        });
        expect(release.hasAttribute("disabled")).toBe(true);
        expect(
            within(rowOf("APPOINTMENTS")).getByText(
                "Your access doesn't cover releases.",
            ),
        ).toBeTruthy();

        const give = within(rowOf("COMMERCE")).getByRole("button", {
            name: "Give this module…",
        });
        expect(give.hasAttribute("disabled")).toBe(true);
        expect(
            within(rowOf("COMMERCE")).getByText(
                "Your access doesn't cover giving offers.",
            ),
        ).toBeTruthy();

        // The one they hold stays pressable.
        const switchOn = within(rowOf("COURSES")).getByRole("button", {
            name: "Switch on for them…",
        });
        expect(switchOn.hasAttribute("disabled")).toBe(false);
    });

    it("opens the offer sheet from Give this module…, not another page", () => {
        renderRows([commerceLocked]);
        expect(within(rowOf("COMMERCE")).queryByRole("link")).toBeNull();
        fireEvent.click(
            within(rowOf("COMMERCE")).getByRole("button", {
                name: "Give this module…",
            }),
        );
        expect(
            screen.getByRole("dialog", { name: "Give a custom offer" }),
        ).toBeTruthy();
        expect(actions.offerOptionsAction).toHaveBeenCalledWith("org_1");
    });

    it("shows the plan-limits note once, above the rows", () => {
        renderRows([bookingsOff, coursesSwitchedOff, commerceLocked]);
        expect(
            screen.getAllByText(/Plan limits not enforced yet/),
        ).toHaveLength(1);
    });

    it("shows dependencies as information, not as a fix", () => {
        renderRows([bookingsOff]);
        const deps = rowOf("APPOINTMENTS").querySelector("[data-dependencies]");
        expect(deps?.textContent).toBe("Works with Website (on)");
        expect(
            within(rowOf("APPOINTMENTS")).getAllByRole("button"),
        ).toHaveLength(1);
    });

    it("opens one sheet at a time", async () => {
        renderRows([bookingsOff, coursesSwitchedOff]);
        fireEvent.click(
            screen.getByRole("button", { name: "Turn on for this business…" }),
        );
        expect(await screen.findAllByRole("dialog")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        fireEvent.click(
            screen.getByRole("button", { name: "Switch on for them…" }),
        );
        const dialogs = await screen.findAllByRole("dialog");
        expect(dialogs).toHaveLength(1);
        expect(
            within(dialogs[0]).getByText("Switch Courses on for Rye & Co.?"),
        ).toBeTruthy();
    });

    it("says only they can finish a setup step, with steps to copy", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        renderRows([
            row({
                moduleKey: "PAYMENTS",
                label: "Payments",
                state: "on",
                blocker: "PAYMENT_PROVIDER_MISSING",
                reason: "Connect a payment provider",
                fix: { kind: "merchant", label: "Only they can finish this" },
            }),
        ]);
        fireEvent.click(
            screen.getByRole("button", { name: "Only they can do this…" }),
        );
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(/Connect a payment provider/, {
                selector: "div",
            }),
        ).toBeTruthy();
        fireEvent.click(
            within(dialog).getByRole("button", { name: /Copy steps/ }),
        );
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toContain(
            "Payments needs one more step from you: connect a payment provider.",
        );
    });

    it("keeps their own switch on each row for those who may change it", () => {
        renderRows([row({}), bookingsOff], ALL, {
            switches: { APPOINTMENTS: true },
        });
        expect(
            within(rowOf("CRM")).getByRole("button", { name: "Turn off" }),
        ).toBeTruthy();
        expect(
            within(rowOf("APPOINTMENTS")).getByRole("button", {
                name: "Turn off",
            }),
        ).toBeTruthy();
    });
});
