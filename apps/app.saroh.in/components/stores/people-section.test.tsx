// @vitest-environment jsdom
/**
 * A location's People tab (owner, 10 Oct): the roster read first as rows,
 * the invitations still out under it, and "Invite someone" opening a side
 * sheet, shown only to someone who may invite. Made-up people only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Invitation, Member } from "@/lib/members/service";
import type { LocationPeople } from "@/lib/stores/people";

import { PeopleSection } from "./people-section";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));
const invite = vi.fn();
const revoke = vi.fn();
vi.mock("@/lib/members/actions", () => ({
    inviteMember: (...args: unknown[]) => invite(...args) as unknown,
    removeMember: vi.fn(),
    revokeInvitation: (...args: unknown[]) => revoke(...args) as unknown,
    updateMemberRole: vi.fn(),
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));

const owner: Member = {
    userId: "u_owner",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    role: "OWNER",
    kind: "owner",
};
const dev: Member = {
    userId: "u_dev",
    name: "Dev Shah",
    email: "dev.shah@example.com",
    role: "EDITOR",
    kind: "member",
};
const invited: Invitation = {
    id: "inv_1",
    email: "mira.sen@example.com",
    role: "VIEWER",
    status: "PENDING",
    expiresAt: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-10-10T00:00:00.000Z",
};
const full: LocationPeople = {
    members: [owner, dev],
    invitations: [invited],
    canManage: true,
    canInvite: true,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [refresh, invite, revoke, showError, showSuccess]) {
        mock.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(people: LocationPeople | null) {
    act(() =>
        root.render(
            <PeopleSection
                store={{ id: "st_hill", name: "Hill Road" }}
                people={people}
            />,
        ),
    );
}

const button = (name: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const email = () =>
    document.querySelector<HTMLInputElement>('input[type="email"]');
const rows = (testid: string) =>
    Array.from(
        host.querySelectorAll(`[data-testid="${testid}"] > li`),
        (li) => li.textContent,
    );

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}
async function press(el: HTMLElement | null | undefined) {
    await act(async () => {
        el?.click();
        await Promise.resolve();
    });
    await settle();
}
function type(field: HTMLInputElement | null, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(field, value);
        field?.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("the roster, read first", () => {
    it("one line of explanation, then each person as a row: name, email, role", () => {
        draw({ ...full, canManage: false, canInvite: false });
        expect(host.textContent).toContain(
            "Who can work on Hill Road's catalogue, orders and customers. Everyone here is also on your team, under Team.",
        );
        expect(rows("location-people")).toEqual([
            "Asha Raoasha.rao@example.comOwner",
            "Dev Shahdev.shah@example.comEditor",
        ]);
        // Nothing to type into until someone asks to invite.
        expect(host.querySelector("input")).toBeNull();
        expect(sheet()).toBeNull();
    });

    it("someone with no name is shown by their email, once", () => {
        draw({
            ...full,
            members: [owner, { ...dev, name: null }],
            canManage: false,
            canInvite: false,
        });
        expect(rows("location-people")[1]).toBe("dev.shah@example.comEditor");
    });

    it("someone who may manage gets each person's role and Remove; the owner's row has neither", () => {
        draw(full);
        expect(
            host.querySelector('[aria-label="Role for dev.shah@example.com"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('[aria-label="Remove Dev Shah"]'),
        ).not.toBeNull();
        expect(
            host.querySelector('[aria-label="Role for asha.rao@example.com"]'),
        ).toBeNull();
        expect(host.querySelector('[aria-label="Remove Asha Rao"]')).toBeNull();
    });

    it("someone who may not manage gets no role select, no Remove and no invitations", () => {
        draw({ ...full, canManage: false, canInvite: false });
        expect(host.querySelector('[role="combobox"]')).toBeNull();
        expect(button("Remove")).toBeUndefined();
        expect(host.querySelector('[data-testid="location-invited"]')).toBe(
            null,
        );
        expect(host.textContent).not.toContain("mira.sen@example.com");
    });

    it("invitations still out are their own group, each with Revoke", async () => {
        revoke.mockResolvedValue({ ok: true, data: { ok: true } });
        draw(full);
        expect(host.textContent).toContain("Invited");
        expect(rows("location-invited")).toEqual([
            "mira.sen@example.comInvited as viewerRevoke",
        ]);
        await press(button("Revoke"));
        expect(revoke).toHaveBeenCalledWith("st_hill", "inv_1");
        expect(showSuccess).toHaveBeenCalledWith("Invitation revoked");
        expect(refresh).toHaveBeenCalled();
    });
});

describe("Invite someone", () => {
    it("is shown only to someone who may invite", () => {
        draw(full);
        expect(button("Invite someone")).toBeDefined();
        draw({ ...full, canInvite: false });
        expect(button("Invite someone")).toBeUndefined();
        // Managing without the team's invite says why, and who can.
        expect(host.textContent).toContain(
            "your role can't invite people to the team. Ask an owner or admin to invite them.",
        );
        draw({ ...full, canManage: false, canInvite: false });
        expect(button("Invite someone")).toBeUndefined();
        expect(host.textContent).not.toContain("Ask an owner or admin");
    });

    it("opens a sheet with Email, Role and the line about the team", async () => {
        draw(full);
        await press(button("Invite someone"));
        expect(sheetName()).toBe("Invite someone");
        const t = sheet()?.textContent ?? "";
        expect(t).toContain("Email");
        expect(t).toContain("Role");
        expect(t).toContain(
            "They also join your team as Location team, unless they are on it already.",
        );
        expect(button("Send invite")).toBeDefined();
        expect(button("Cancel")).toBeDefined();
        // The keyboard starts in the email.
        expect(document.activeElement).toBe(email());
    });

    it("sends the email and role, closes, says so and reads the roster again", async () => {
        invite.mockResolvedValue({ ok: true, data: { ok: true } });
        draw(full);
        await press(button("Invite someone"));
        type(email(), " kiran.bose@example.com ");
        await press(button("Send invite"));
        expect(invite).toHaveBeenCalledTimes(1);
        expect(invite).toHaveBeenCalledWith(
            "st_hill",
            "kiran.bose@example.com",
            "VIEWER",
        );
        expect(showSuccess).toHaveBeenCalledWith(
            "Invitation sent. When they accept, they're also added to your team, as Location team.",
        );
        expect(sheet()).toBeNull();
        // The page reads the roster again, so the invitation shows.
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("an empty or malformed email is said under the field and not sent", async () => {
        draw(full);
        await press(button("Invite someone"));
        await press(button("Send invite"));
        expect(sheet()?.textContent).toContain("Enter their email");
        type(email(), "kiran");
        await press(button("Send invite"));
        expect(sheet()?.textContent).toContain("Enter a valid email");
        expect(invite).not.toHaveBeenCalled();
    });

    it("a refusal keeps the sheet open with what was typed", async () => {
        invite.mockResolvedValue({
            ok: false,
            error: "Your plan's team is full.",
        });
        draw(full);
        await press(button("Invite someone"));
        type(email(), "kiran.bose@example.com");
        await press(button("Send invite"));
        expect(showError).toHaveBeenCalledWith("Your plan's team is full.");
        expect(sheetName()).toBe("Invite someone");
        expect(email()?.value).toBe("kiran.bose@example.com");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a refusal that names the email is said under it", async () => {
        invite.mockResolvedValue({
            ok: false,
            error: "They already work here.",
            field: "email",
        });
        draw(full);
        await press(button("Invite someone"));
        type(email(), "dev.shah@example.com");
        await press(button("Send invite"));
        expect(showError).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("They already work here.");
        expect(email()?.value).toBe("dev.shah@example.com");
    });

    it("Cancel drops what was typed and returns to the button", async () => {
        draw(full);
        await press(button("Invite someone"));
        type(email(), "kiran.bose@example.com");
        await press(button("Cancel"));
        expect(sheet()).toBeNull();
        expect(invite).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(button("Invite someone"));
        await press(button("Invite someone"));
        expect(email()?.value).toBe("");
    });
});

describe("the tab's other states", () => {
    it("only the owner: says no one else works here and offers the invite, not a list of one", async () => {
        draw({ ...full, members: [owner], invitations: [] });
        expect(host.textContent).toContain("No one else works here yet");
        expect(host.textContent).toContain(
            "Asha Rao (asha.rao@example.com) owns Hill Road. Invite someone to work on its catalogue, orders and customers.",
        );
        expect(
            host.querySelector('[data-testid="location-people"]'),
        ).toBeNull();
        // One Invite someone, in the empty state.
        expect(
            Array.from(host.querySelectorAll("button")).filter(
                (b) => b.textContent === "Invite someone",
            ),
        ).toHaveLength(1);
        await press(button("Invite someone"));
        expect(sheetName()).toBe("Invite someone");
    });

    it("only the owner, read by someone who can't invite: no action offered", () => {
        draw({
            members: [owner],
            invitations: [],
            canManage: false,
            canInvite: false,
        });
        expect(host.textContent).toContain("No one else works here yet");
        expect(host.textContent).toContain(
            "Asha Rao (asha.rao@example.com) owns Hill Road.",
        );
        expect(host.textContent).not.toContain("Invite someone");
    });

    it("the owner with an invitation out is a roster, not the empty state", () => {
        draw({ ...full, members: [owner] });
        expect(host.textContent).not.toContain("No one else works here yet");
        expect(rows("location-people")).toHaveLength(1);
        expect(rows("location-invited")).toHaveLength(1);
    });

    it("a roster that couldn't be read is a failed state with Try again, never an empty one", async () => {
        draw(null);
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(
            "The people here could not be loaded",
        );
        expect(host.textContent).not.toContain("No one else works here yet");
        await press(button("Try again"));
        expect(refresh).toHaveBeenCalled();
    });

    it("someone the API shows no roster to is told so, not shown an empty list", () => {
        draw({
            members: [],
            invitations: [],
            canManage: false,
            canInvite: false,
        });
        expect(host.textContent).toContain("You can't see who works here");
        expect(host.textContent).not.toContain("No one else works here yet");
        expect(button("Invite someone")).toBeUndefined();
    });
});
