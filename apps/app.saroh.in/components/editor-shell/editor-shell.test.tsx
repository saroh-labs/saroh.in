// @vitest-environment jsdom
/**
 * The editor shell (D6) with a stand-in record type: a two-field "plan"
 * whose adapter the test answers. What D7 and E18 lean on is pinned here —
 * the status line from typing to saved, Publish and Discard, the failed
 * and conflict states, and leaving.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorShellProps } from "@/components/editor-shell/editor-shell";
import { EditorShell } from "@/components/editor-shell/editor-shell";
import type {
    EditorAdapter,
    EditorRecord,
    EditorResult,
} from "@/lib/editor-shell/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh, replace: vi.fn() }),
    usePathname: () => "/billing/plans/new",
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

interface Plan extends Record<string, unknown> {
    name: string;
    price: string;
}

const EMPTY: Plan = { name: "", price: "" };

function rec(over: Partial<EditorRecord<Plan>> = {}): EditorRecord<Plan> {
    return {
        id: "pl-1",
        status: "DRAFT",
        hasPendingChanges: false,
        revision: 1,
        values: { name: "Monthly", price: "1200" },
        published: null,
        canDelete: true,
        ...over,
    };
}

const LIVE = rec({
    status: "ACTIVE",
    revision: 4,
    published: { name: "Monthly", price: "1200" },
    canDelete: false,
});

function adapterMock() {
    return {
        create: vi.fn<EditorAdapter<Plan>["create"]>(),
        saveDraft: vi.fn<EditorAdapter<Plan>["saveDraft"]>(),
        publish: vi.fn<EditorAdapter<Plan>["publish"]>(),
        discard: vi.fn<EditorAdapter<Plan>["discard"]>(),
        remove: vi.fn<EditorAdapter<Plan>["remove"]>(),
        load: vi.fn<EditorAdapter<Plan>["load"]>(),
    };
}

let root: Root;
let host: HTMLDivElement;
let adapter: ReturnType<typeof adapterMock>;

beforeEach(() => {
    vi.useFakeTimers();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    adapter = adapterMock();
    push.mockReset();
    refresh.mockReset();
    toast.showSuccess.mockReset();
    toast.showError.mockReset();
    window.history.replaceState(null, "", "/billing/plans/new");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

function render(initial: EditorRecord<Plan> | null) {
    const props: EditorShellProps<Plan> = {
        adapter,
        copy: {
            noun: "plan",
            liveLabel: "Open",
            liveClean: "Open to new sign-ups · no changes",
            draftSaved: "Draft · saved — nobody can join it yet",
            draftFirstSaved:
                "Saved as a draft — nobody can join it yet. Delete draft if you change your mind.",
            notStarted: "Not saved yet — start with a name",
            viewLabel: "View plan",
        },
        initial,
        emptyValues: EMPTY,
        canEdit: true,
        crumbs: (
            <nav>
                {/* A plain link: the guard catches any <a>, Next's or not. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/billing/subscriptions?tab=plans">Plans</a>
            </nav>
        ),
        titleOf: (v, r) => v.name.trim() || (r ? "Untitled plan" : "New plan"),
        problemsOf: (v) => [
            ...(v.name.trim()
                ? []
                : [{ field: "name", message: "Give it a name" }]),
            ...(Number(v.price) > 0
                ? []
                : [{ field: "price", message: "Add the price" }]),
        ],
        blockerOf: (v) =>
            v.name.trim() ? null : "Add a name to save the draft",
        changesOf: (p, v) =>
            [
                p.price !== v.price &&
                    `price ₹${p.price} → ₹${v.price} for new sign-ups`,
                p.name !== v.name && `renamed to ${v.name}`,
            ].filter((x): x is string => typeof x === "string"),
        changesNote: () => "The 12 already on it keep what they pay now.",
        fieldLabels: { name: "name", price: "price" },
        hrefFor: (id) => `/billing/plans/${id}/edit`,
        viewHrefFor: (id) => `/billing/plans/${id}`,
        afterDeleteHref: "/billing/subscriptions?tab=plans",
        publishedMessage: (r, wasLive) =>
            wasLive
                ? "Changes published."
                : `${r.values.name} is open for sign-ups.`,
        children: ({ values, set, errors }) => (
            <>
                <label>
                    Name
                    <input
                        aria-label="Name"
                        value={values.name}
                        onChange={(e) => set({ name: e.target.value })}
                    />
                </label>
                {errors.name ? <p role="alert">{errors.name}</p> : null}
                <label>
                    Price
                    <input
                        aria-label="Price"
                        value={values.price}
                        onChange={(e) => set({ price: e.target.value })}
                    />
                </label>
                {errors.price ? <p role="alert">{errors.price}</p> : null}
            </>
        ),
    };
    act(() => {
        root.render(<EditorShell {...props} />);
    });
}

const status = () =>
    host.querySelector<HTMLElement>("[role=status]")?.textContent ?? "";
const heading = () => host.querySelector("h1")?.textContent ?? "";

function field(label: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
    );
    if (!el) throw new Error(`No field ${label}`);
    return el;
}

function crumbLink(): HTMLAnchorElement {
    const el = host.querySelector<HTMLAnchorElement>("nav a");
    if (!el) throw new Error("No crumb link");
    return el;
}

function inDialog(name: string): HTMLButtonElement {
    const dialog = document.querySelector("[role=alertdialog]");
    const hit = buttons(name).find((b) => dialog?.contains(b));
    if (!hit) throw new Error(`No ${name} in the dialog`);
    return hit;
}

function type(input: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function buttons(name: string): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => b.textContent.trim() === name);
}

function button(name: string): HTMLButtonElement {
    const hit = buttons(name).at(0);
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    });
}

/** Run pending timers, and let the answers they wait on settle. */
async function wait(ms = 0) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        for (let i = 0; i < 8; i++) await Promise.resolve();
    });
}

const ok = <T,>(data: T): EditorResult<T> => ({ ok: true, data });

describe("the editor shell", () => {
    it("typing a new plan → Saving… → saved as a draft, at its own address", async () => {
        adapter.create.mockResolvedValue(
            ok(rec({ values: { name: "Monthly", price: "" } })),
        );
        render(null);
        expect(heading()).toBe("New plan");
        expect(status()).toBe("Not saved yet — start with a name");
        // No problems marked before anything is typed.
        expect(host.querySelector("[role=alert]")).toBeNull();

        type(field("Name"), "Monthly");
        expect(status()).toBe("Saving…");
        expect(heading()).toBe("Monthly");
        await wait(799);
        expect(adapter.create).not.toHaveBeenCalled();
        await wait(1);
        expect(adapter.create).toHaveBeenCalledWith({
            name: "Monthly",
            price: "",
        });
        expect(status()).toBe(
            "Saved as a draft — nobody can join it yet. Delete draft if you change your mind.",
        );
        expect(window.location.pathname).toBe("/billing/plans/pl-1/edit");
        // Draft: Publish (off, the price is missing) and Delete draft.
        expect(button("Publish").disabled).toBe(true);
        expect(buttons("Delete draft").length).toBeGreaterThan(0);
        expect(host.textContent).toContain(
            "1 thing to fix before publishing — add the price.",
        );
    });

    it("keeps the address at /new while they type, and moves it once they stop (UX-080)", async () => {
        adapter.create.mockResolvedValue(
            ok(rec({ values: { name: "Monthly", price: "" } })),
        );
        render(null);
        const name = field("Name");
        act(() => name.focus());
        type(name, "Monthly");
        await wait(800);
        expect(adapter.create).toHaveBeenCalled();
        // Still typing: the address hasn't jumped.
        expect(window.location.pathname).toBe("/billing/plans/new");
        // Into the price is still typing.
        act(() => field("Price").focus());
        await wait(0);
        expect(window.location.pathname).toBe("/billing/plans/new");
        // Out of every field: the draft's own address.
        act(() => field("Price").blur());
        await wait(0);
        expect(window.location.pathname).toBe("/billing/plans/pl-1/edit");
    });

    it("says why a nameless draft can't save, and sends nothing", async () => {
        render(null);
        type(field("Price"), "1200");
        await wait(2000);
        expect(status()).toBe("Add a name to save the draft");
        expect(adapter.create).not.toHaveBeenCalled();
    });

    it("the next save uses the draft's own id and revision", async () => {
        adapter.create.mockResolvedValue(ok(rec({ revision: 1 })));
        adapter.saveDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        render(null);
        type(field("Name"), "Monthly");
        await wait(800);
        type(field("Price"), "1200");
        await wait(800);
        expect(adapter.saveDraft).toHaveBeenCalledWith(
            "pl-1",
            { name: "Monthly", price: "1200" },
            1,
        );
        // The first save's words stay for the visit, as the design has them.
        expect(status()).toBe(
            "Saved as a draft — nobody can join it yet. Delete draft if you change your mind.",
        );
    });

    it("leaving after a save asks nothing", async () => {
        adapter.saveDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        render(rec());
        type(field("Price"), "1300");
        await wait(800);
        const link = crumbLink();
        // Reached the link itself, so the guard (capture, on the document)
        // let it go; jsdom can't navigate, so it stops here.
        let reached = false;
        link.addEventListener("click", (e) => {
            reached = !e.defaultPrevented;
            e.preventDefault();
        });
        click(link);
        await wait();
        expect(reached).toBe(true);
        expect(adapter.saveDraft).toHaveBeenCalledTimes(1);
        expect(push).not.toHaveBeenCalled();
        expect(document.querySelector("[role=alertdialog]")).toBeNull();
    });

    it("leaving while an edit waits saves it first, then goes", async () => {
        adapter.saveDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        render(rec());
        type(field("Price"), "1300");
        click(crumbLink());
        await wait();
        expect(adapter.saveDraft).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith("/billing/subscriptions?tab=plans");
        expect(document.querySelector("[role=alertdialog]")).toBeNull();
    });

    it("a failed save says Not saved; leaving asks first and names the fields", async () => {
        adapter.saveDraft.mockResolvedValue({
            ok: false,
            error: "Couldn't reach Saroh",
        });
        render(rec());
        type(field("Price"), "1500");
        await wait(800);
        expect(status()).toBe("Not saved — your changes are still here.");
        expect(field("Price").value).toBe("1500");
        expect(button("Publish").disabled).toBe(true);

        click(crumbLink());
        await wait();
        expect(push).not.toHaveBeenCalled();
        const dialog = document.querySelector("[role=alertdialog]");
        expect(dialog?.textContent).toContain(
            "Your changes to price aren't saved",
        );
        click(button("Stay"));
        expect(document.querySelector("[role=alertdialog]")).toBeNull();

        // Try again sends it once more.
        adapter.saveDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        click(button("Try again"));
        await wait();
        expect(adapter.saveDraft).toHaveBeenCalledTimes(2);
        expect(status()).toBe("Draft · saved — nobody can join it yet");
    });

    it("a field refusal from the server shows beside that field", async () => {
        adapter.saveDraft.mockResolvedValue({
            ok: false,
            error: "There's already a plan called Weekly",
            field: "name",
        });
        render(rec());
        type(field("Name"), "Weekly");
        await wait(800);
        expect(host.textContent).toContain(
            "There's already a plan called Weekly",
        );
    });

    it("a 409 names who changed it, stops saving, and Reload loads their revision", async () => {
        adapter.saveDraft.mockResolvedValue({
            ok: false,
            error: "Someone else changed this plan.",
            conflict: { changedBy: "Priya", changedAt: null, current: 5 },
        });
        render(LIVE);
        type(field("Price"), "1300");
        await wait(800);
        expect(status()).toMatch(/^Priya changed this plan/);
        expect(button("Publish changes").disabled).toBe(true);
        type(field("Price"), "1350");
        await wait(5000);
        expect(adapter.saveDraft).toHaveBeenCalledTimes(1);
        expect(field("Price").value).toBe("1350");

        adapter.load.mockResolvedValue(
            ok({
                ...LIVE,
                revision: 5,
                hasPendingChanges: true,
                values: { name: "Monthly", price: "1500" },
            }),
        );
        click(button("Reload"));
        await wait();
        expect(adapter.load).toHaveBeenCalledWith("pl-1");
        expect(field("Price").value).toBe("1500");
        expect(status()).toBe("Unpublished changes · saved as a draft");

        adapter.saveDraft.mockResolvedValue(
            ok({ ...LIVE, revision: 6, hasPendingChanges: true }),
        );
        type(field("Price"), "1600");
        await wait(800);
        expect(adapter.saveDraft).toHaveBeenLastCalledWith(
            "pl-1",
            { name: "Monthly", price: "1600" },
            5,
        );
    });

    it("a live plan: an edit becomes unpublished changes, and Publish changes sends the revision", async () => {
        render(LIVE);
        expect(status()).toBe("Open to new sign-ups · no changes");
        expect(button("Publish changes").disabled).toBe(true);
        expect(host.textContent).toContain(
            "Nothing to publish yet — edits appear here as a draft first.",
        );
        expect(buttons("Discard changes")).toHaveLength(0);

        adapter.saveDraft.mockResolvedValue(
            ok({
                ...LIVE,
                revision: 5,
                hasPendingChanges: true,
                values: { name: "Monthly", price: "1500" },
            }),
        );
        type(field("Price"), "1500");
        await wait(800);
        expect(status()).toBe("Unpublished changes · saved as a draft");
        expect(host.textContent).toContain(
            "When you publish: price ₹1200 → ₹1500 for new sign-ups. The 12 already on it keep what they pay now.",
        );
        expect(buttons("Discard changes").length).toBeGreaterThan(0);

        adapter.publish.mockResolvedValue(
            ok({
                ...LIVE,
                revision: 6,
                values: { name: "Monthly", price: "1500" },
                published: { name: "Monthly", price: "1500" },
            }),
        );
        click(button("Publish changes"));
        await wait();
        expect(adapter.publish).toHaveBeenCalledWith("pl-1", 5);
        expect(toast.showSuccess).toHaveBeenCalledWith("Changes published.");
        expect(refresh).toHaveBeenCalled();
        expect(status()).toBe("Open to new sign-ups · no changes");
        expect(host.textContent).not.toContain("When you publish");
    });

    it("Publish on a draft saves the last keystroke first", async () => {
        adapter.saveDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        adapter.publish.mockResolvedValue(
            ok(rec({ status: "ACTIVE", revision: 3, canDelete: false })),
        );
        render(rec());
        type(field("Price"), "1300");
        click(button("Publish"));
        await wait();
        expect(adapter.saveDraft).toHaveBeenCalledTimes(1);
        expect(adapter.publish).toHaveBeenCalledWith("pl-1", 2);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Monthly is open for sign-ups.",
        );
    });

    it("a publish refused on a stale revision turns into the conflict state", async () => {
        adapter.publish.mockResolvedValue({
            ok: false,
            error: "Someone else changed this plan.",
            conflict: { changedBy: "Priya", changedAt: null, current: 6 },
        });
        render({ ...LIVE, hasPendingChanges: true, revision: 5 });
        click(button("Publish changes"));
        await wait();
        expect(status()).toMatch(/^Priya changed this plan/);
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("Discard changes confirms, naming what goes, then shows the live values", async () => {
        render({
            ...LIVE,
            hasPendingChanges: true,
            revision: 5,
            values: { name: "Monthly", price: "1500" },
        });
        click(button("Discard changes"));
        const dialog = document.querySelector("[role=alertdialog]");
        expect(dialog?.textContent).toContain("Discard changes to Monthly?");
        expect(dialog?.textContent).toContain(
            "These go: price ₹1200 → ₹1500 for new sign-ups.",
        );
        adapter.discard.mockResolvedValue(ok({ ...LIVE, revision: 6 }));
        click(inDialog("Discard changes"));
        await wait();
        expect(adapter.discard).toHaveBeenCalledWith("pl-1", 5);
        expect(field("Price").value).toBe("1200");
        expect(toast.showSuccess).toHaveBeenCalledWith("Changes discarded.");
    });

    it("Delete draft confirms, then leaves for the list", async () => {
        render(rec());
        click(button("Delete draft"));
        const dialog = document.querySelector("[role=alertdialog]");
        expect(dialog?.textContent).toContain("Delete Monthly?");
        adapter.remove.mockResolvedValue(ok(null));
        click(inDialog("Delete draft"));
        await wait();
        expect(adapter.remove).toHaveBeenCalledWith("pl-1", 1);
        expect(push).toHaveBeenCalledWith("/billing/subscriptions?tab=plans");
    });

    it("a role that can't edit sees the record, a read-only note and no actions", () => {
        act(() => {
            root.render(
                <EditorShell<Plan>
                    adapter={adapter}
                    copy={{
                        noun: "plan",
                        liveLabel: "Open",
                        liveClean: "Open to new sign-ups · no changes",
                        draftSaved: "",
                        draftFirstSaved: "",
                        notStarted: "",
                        viewLabel: "View plan",
                    }}
                    initial={LIVE}
                    emptyValues={EMPTY}
                    canEdit={false}
                    readOnlyText="Your role can read this plan but not change it."
                    titleOf={(v) => v.name}
                    problemsOf={() => []}
                    blockerOf={() => null}
                    changesOf={() => []}
                    fieldLabels={{}}
                    hrefFor={(id) => id}
                    viewHrefFor={(id) => id}
                    afterDeleteHref="/"
                    publishedMessage={() => ""}
                >
                    {({ values }) => <span>{values.price}</span>}
                </EditorShell>,
            );
        });
        expect(host.textContent).toContain(
            "Your role can read this plan but not change it.",
        );
        expect(buttons("Publish changes")).toHaveLength(0);
        expect(host.querySelector("fieldset")?.disabled).toBe(true);
    });
});
