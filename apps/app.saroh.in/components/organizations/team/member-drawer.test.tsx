// @vitest-environment jsdom
/**
 * The People drawer is one sheet that opens for one person after another.
 * What was ticked for one person and not saved must never follow it to the
 * next, however the sheet was left.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationMember } from "@/lib/organizations/members";
import type { RoleCatalogue } from "@/lib/organizations/roles";

import { MemberDrawer } from "./member-drawer";
import { roleBook } from "./role-book";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/organizations/member-actions", () => ({
    updateMemberRole: vi.fn(),
    setMemberExtraActions: vi.fn(),
}));

const CATALOGUE: RoleCatalogue = {
    groups: ["sell"],
    capabilities: [
        { action: "order:read", group: "sell", label: "See orders" },
        { action: "store:write", group: "sell", label: "Change locations" },
    ],
};

function member(
    userId: string,
    name: string,
    role: string,
): OrganizationMember {
    return {
        userId,
        name,
        email: `${userId}@example.com`,
        role,
        siteIds: [],
        isSelf: false,
        lastActiveAt: null,
    } as OrganizationMember;
}

const asha = member("u1", "Asha", "OWNER");
const ravi = member("u2", "Ravi", "OWNER");
const meera = member("u3", "Meera", "MEMBER");
const book = roleBook({
    roles: [],
    organizationName: "Rye Bakery",
    catalogue: CATALOGUE,
    myActions: null,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function draw(open: OrganizationMember | null) {
    act(() =>
        root.render(
            <MemberDrawer
                member={open}
                members={[asha, ravi, meera]}
                organizationName="Rye Bakery"
                book={book}
                canEditExtras
                rolesLock={null}
                onClose={() => undefined}
                onRemove={() => undefined}
            />,
        ),
    );
}

const seeOrders = () =>
    Array.from(
        document.body.querySelectorAll<HTMLElement>("[role=switch]"),
    ).find((s) =>
        s
            .closest("label, [data-switch-row], li, div")
            ?.textContent.includes("See orders"),
    );

describe("the People drawer", () => {
    it("forgets an unsaved extra when an owner is handed to Remove", () => {
        draw(asha);
        const before = seeOrders();
        expect(before?.getAttribute("aria-checked")).toBe("false");
        act(() => before?.click());
        expect(seeOrders()?.getAttribute("aria-checked")).toBe("true");

        const remove = Array.from(
            document.body.querySelectorAll("button"),
        ).find((b) => b.textContent.trim() === "Remove from Rye Bakery");
        expect(remove).toBeDefined();
        act(() => remove?.click());

        // Remove's confirm takes over; Keep closes it. Then Edit another.
        draw(null);
        draw(meera);
        expect(seeOrders()?.getAttribute("aria-checked")).toBe("false");
    });
});
