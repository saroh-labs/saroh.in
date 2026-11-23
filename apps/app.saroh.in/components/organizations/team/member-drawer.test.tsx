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
// The photo's upload and save are tested with the fields themselves.
vi.mock("@/components/staff/profile-photo", () => ({
    StaffProfileFields: ({ name }: { name: string }) => (
        <div data-photo-for={name}>Photo (optional)</div>
    ),
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

function draw(
    open: OrganizationMember | null,
    profile: { staffId: string; photo: null; about: null } | null = null,
) {
    act(() =>
        root.render(
            <MemberDrawer
                member={open}
                profile={profile}
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

    it("offers the photo only to someone who may set it, at the top, for that person", () => {
        draw(meera);
        expect(document.body.querySelector("[data-photo-for]")).toBeNull();
        draw(meera, { staffId: "st_3", photo: null, about: null });
        const photo = document.body.querySelector("[data-photo-for]");
        expect(photo?.getAttribute("data-photo-for")).toBe("Meera");
        expect(
            photo?.compareDocumentPosition(
                document.body.querySelector(
                    "[role=radiogroup], .label",
                ) as Node,
            ) ?? 0,
        ).toBeGreaterThan(0);
    });
});
