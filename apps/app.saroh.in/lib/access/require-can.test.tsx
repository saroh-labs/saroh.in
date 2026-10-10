/**
 * `requireCan`, the first line of every create, edit and import page: it
 * denies only when the API said what this person may do and the permission
 * isn't there, and its denial is the one sentence.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";

const resolveActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => resolveActiveOrganization() as unknown,
}));

import { canOrUnknown, deniedFor, requireCan } from "./require-can";

const org = (over: Partial<Organization> = {}): Organization => ({
    id: "org_1",
    name: "Rye & Co.",
    slug: "rye",
    role: "MEMBER",
    roleKey: "MEMBER",
    actions: ["org:read", "contact:read", "booking:read"],
    ...over,
});

/** The markup's text, with the apostrophes it escapes put back. */
const text = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

beforeEach(() => resolveActiveOrganization.mockReset());

describe("requireCan", () => {
    it("opens for someone who holds the permission", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org({ actions: ["contact:read", "contact:write"] }),
        );
        const access = await requireCan("contact:write", {
            thing: "Add customer",
        });
        expect(access.denied).toBeNull();
        expect(access.may("contact:write")).toBe(true);
        expect(access.may("invoice:write")).toBe(false);
    });

    it("denies, in the one sentence, someone who doesn't", async () => {
        resolveActiveOrganization.mockResolvedValue(org());
        const access = await requireCan("contact:write", {
            thing: "Add customer",
        });
        const said = text(access.denied);
        expect(said).toContain("You can't open Add customer");
        expect(said).toContain(
            "Your role in Rye & Co. is Member. It doesn't include Add customer.",
        );
        expect(said).toContain(
            "An owner or admin can change this in Settings › Team.",
        );
        expect(said).not.toContain('role="alert"');
        expect(said).not.toMatch(/Try again|contact:write/);
    });

    it("judges a role the business made by what was ticked, not its name", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org({
                roleKey: "web-person",
                roleLabel: "Web person",
                actions: ["site:read", "site:create"],
            }),
        );
        expect(
            (await requireCan("site:create", { thing: "New site" })).denied,
        ).toBeNull();

        resolveActiveOrganization.mockResolvedValue(
            org({ role: "ADMIN", roleKey: "narrow", actions: ["site:read"] }),
        );
        expect(
            (await requireCan("site:create", { thing: "New site" })).denied,
        ).not.toBeNull();
    });

    it("takes any one of several permissions", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org({ actions: ["pack:sell"] }),
        );
        expect(
            (await requireCan(["pack:sell", "pack:write"], { thing: "x" }))
                .denied,
        ).toBeNull();
    });

    it("opens when the permissions aren't known: the API decides", async () => {
        resolveActiveOrganization.mockResolvedValue(
            org({ actions: undefined }),
        );
        const access = await requireCan("contact:write", { thing: "x" });
        expect(access.denied).toBeNull();
        // Nothing is claimed either: a control asking `may` stays hidden.
        expect(access.may("contact:write")).toBe(false);

        resolveActiveOrganization.mockResolvedValue(null);
        expect(
            (await requireCan("contact:write", { thing: "x" })).denied,
        ).toBeNull();
    });

    it("uses the organization the page already read", async () => {
        const access = await requireCan(
            "site:create",
            { thing: "New site" },
            org(),
        );
        expect(resolveActiveOrganization).not.toHaveBeenCalled();
        expect(access.denied).not.toBeNull();
    });
});

describe("the denial's way back", () => {
    it("goes where the person may go, and Home otherwise", () => {
        const back = {
            href: "/commerce/customers",
            label: "Back to Customers",
            needs: "contact:read",
        };
        expect(text(deniedFor(org(), { thing: "x", back }))).toContain(
            'href="/commerce/customers"',
        );
        const none = text(
            deniedFor(org({ actions: ["org:read"] }), { thing: "x", back }),
        );
        expect(none).toContain('href="/"');
        expect(none).toContain("Back to Home");
        expect(none).not.toContain("Back to Customers");
    });

    it("leaves out a role it can't name, and never shows its key", () => {
        const said = text(
            deniedFor(org({ roleKey: "role_8f2c", roleLabel: null }), {
                thing: "New invoice",
            }),
        );
        expect(said).toContain(
            "Your role in Rye & Co. doesn't include New invoice.",
        );
        expect(said).not.toContain("role_8f2c");
    });

    it("says only the owner can, for an owner-only thing", () => {
        expect(
            text(deniedFor(org(), { thing: "x", ownerOnly: true })),
        ).toContain("Only the owner can change this.");
    });
});

describe("canOrUnknown", () => {
    it("is strict once permissions are known, and open before", () => {
        expect(canOrUnknown({ actions: ["a"] }, "a")).toBe(true);
        expect(canOrUnknown({ actions: ["a"] }, "b")).toBe(false);
        expect(canOrUnknown({ actions: [] }, "a")).toBe(false);
        expect(canOrUnknown({}, "a")).toBe(true);
        expect(canOrUnknown(null, "a")).toBe(true);
    });
});
