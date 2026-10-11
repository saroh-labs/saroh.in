// @vitest-environment jsdom
/**
 * "Leave {business}" (UX audit, 10 Oct 2026): anyone in a business can
 * leave it, the confirm says what they lose, the only owner reads why they
 * can't, and a refusal stays inside the confirm.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    isOnlyOwner,
    leaveWords,
    onlyOwnerLine,
} from "@/lib/organizations/leave-business";
import { activityLine } from "@/lib/settings/activity";

import { LeaveBusiness } from "./leave-business";

const leaveBusiness = vi.fn();
vi.mock("@/lib/organizations/member-actions", () => ({
    leaveBusiness: (...args: unknown[]) => leaveBusiness(...args) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    leaveBusiness.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const tick = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
const dialog = () =>
    document.body.querySelector<HTMLElement>("[role=alertdialog]");
const press = async (name: string, within: ParentNode = document.body) => {
    const hit = Array.from(within.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    await act(async () => {
        hit.click();
        await Promise.resolve();
    });
    await tick();
};

describe("the words", () => {
    it("says what goes, what stays and that it can't be taken back", () => {
        expect(leaveWords("Rye Bakery")).toEqual({
            title: "Leave Rye Bakery?",
            description:
                "You lose access to Rye Bakery now, and any share links you made stop working. Your work stays with the business, and nothing changes in your other businesses. To come back, someone there has to invite you again. This cannot be undone.",
            confirmLabel: "Leave business",
            keepLabel: "Stay",
        });
    });

    it("names the locations they come off", () => {
        expect(
            leaveWords("Rye Bakery", ["Hill Road", "Bandra"]).description,
        ).toContain("You come off Hill Road and Bandra too.");
    });

    it("tells the only owner why not, and what to do first", () => {
        expect(onlyOwnerLine("Rye Bakery")).toBe(
            "You're the only owner of Rye Bakery, and it always needs one. To leave, make someone else an owner first in Settings › Team.",
        );
    });
});

describe("who is the only owner", () => {
    const m = (role: string, isSelf = false, roleKey?: string) => ({
        role,
        isSelf,
        ...(roleKey ? { roleKey } : {}),
    });

    it("is the viewer when they are the one owner on the roster", () => {
        expect(isOnlyOwner([m("OWNER", true), m("ADMIN"), m("MEMBER")])).toBe(
            true,
        );
    });

    it("is not once there is a second owner, or for anyone who isn't one", () => {
        expect(isOnlyOwner([m("OWNER", true), m("OWNER")])).toBe(false);
        expect(isOnlyOwner([m("OWNER"), m("ADMIN", true)])).toBe(false);
        // A role the business made maps to MEMBER, and is judged by its key.
        expect(isOnlyOwner([m("OWNER"), m("MEMBER", true, "front-desk")])).toBe(
            false,
        );
    });

    it("is unknown without a roster: the button shows and the API decides", () => {
        expect(isOnlyOwner(null)).toBe(null);
        expect(isOnlyOwner(undefined)).toBe(null);
    });
});

describe("LeaveBusiness", () => {
    it("is one button, named for the business", () => {
        const html = renderToStaticMarkup(
            <LeaveBusiness business="Rye Bakery" onlyOwner={false} />,
        );
        expect(html).toContain("Leave Rye Bakery");
        expect(html).toContain("<button");
    });

    it("gives the only owner the reason in place of a button", () => {
        const html = renderToStaticMarkup(
            <LeaveBusiness business="Rye Bakery" onlyOwner />,
        );
        expect(html).not.toContain("<button");
        expect(html).toContain("the only owner of Rye Bakery");
        expect(html).toContain("make someone else an owner first");
    });

    it("asks first, in the destructive confirm, and Stay changes nothing", async () => {
        const onLeft = vi.fn();
        act(() =>
            root.render(
                <LeaveBusiness
                    business="Rye Bakery"
                    onlyOwner={false}
                    onLeft={onLeft}
                />,
            ),
        );
        expect(dialog()).toBe(null);
        await press("Leave Rye Bakery");

        expect(dialog()?.textContent).toContain("Leave Rye Bakery?");
        expect(dialog()?.textContent).toContain("This cannot be undone.");
        const buttons = Array.from(dialog()?.querySelectorAll("button") ?? []);
        expect(buttons.map((b) => b.textContent.trim())).toEqual([
            "Stay",
            "Leave business",
        ]);
        // Red: it destroys their place here.
        expect(buttons[1]?.className).toContain("destructive");

        await press("Stay", dialog() ?? undefined);
        expect(dialog()).toBe(null);
        expect(leaveBusiness).not.toHaveBeenCalled();
        expect(onLeft).not.toHaveBeenCalled();
    });

    it("leaves, then goes to their businesses", async () => {
        leaveBusiness.mockResolvedValue({ ok: true, data: { left: true } });
        const onLeft = vi.fn();
        act(() =>
            root.render(
                <LeaveBusiness
                    business="Rye Bakery"
                    onlyOwner={false}
                    onLeft={onLeft}
                />,
            ),
        );
        await press("Leave Rye Bakery");
        await press("Leave business", dialog() ?? undefined);

        expect(leaveBusiness).toHaveBeenCalledTimes(1);
        expect(onLeft).toHaveBeenCalledTimes(1);
    });

    it("stays open with the API's reason when it is refused, and goes nowhere", async () => {
        const refused =
            "You're the only owner of this business, and it always needs one. Make someone else an owner first, then leave.";
        leaveBusiness.mockResolvedValue({ ok: false, error: refused });
        const onLeft = vi.fn();
        act(() =>
            root.render(
                <LeaveBusiness
                    business="Rye Bakery"
                    onlyOwner={false}
                    onLeft={onLeft}
                />,
            ),
        );
        await press("Leave Rye Bakery");
        await press("Leave business", dialog() ?? undefined);

        expect(dialog()).not.toBe(null);
        expect(dialog()?.textContent).toContain(refused);
        expect(onLeft).not.toHaveBeenCalled();
    });
});

describe("Activity says who left, not that they were removed", () => {
    const event = (metadata: Record<string, unknown>) =>
        ({
            id: "e1",
            action: "membership.remove",
            outcome: "SUCCESS",
            createdAt: "2026-10-10T10:00:00.000Z",
            actor: { name: "Meera", email: "meera@example.com" },
            target: { name: "Meera", email: "meera@example.com" },
            targetId: "u1",
            metadata,
        }) as never;

    it("reads 'left the team' for someone who left", () => {
        expect(activityLine(event({ role: "MEMBER", left: true }))?.what).toBe(
            "left the team",
        );
    });

    it("still reads 'removed' for a removal", () => {
        expect(activityLine(event({ role: "MEMBER" }))?.what).toBe(
            "removed Meera from the team",
        );
    });
});
