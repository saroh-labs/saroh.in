import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import type { OrgAction } from "./organization-policy";
import {
    authorize,
    can,
    ORG_ACTIONS,
    outOfReach,
    OWNER_ONLY_ACTIONS,
    OWNER_ONLY_MESSAGE,
    PLAN_OWNER_ONLY_MESSAGE,
    resolveCapabilities,
    ROLE_DENIED,
    ROLE_DENIED_MESSAGE,
    roleDenial,
    withinReach,
} from "./organization-policy";

// The expected allow-set per role, written out independently of the
// implementation so this test actually pins behavior rather than mirroring it.
const EXPECTED: Record<OrgRole, OrgAction[]> = {
    OWNER: [...ORG_ACTIONS],
    // Closing the business, changing its web address (DEC-069) and
    // changing what it pays Saroh (DEC-131, amended 2026-10-11) are the
    // Owner's alone.
    ADMIN: ORG_ACTIONS.filter(
        (action) =>
            action !== "org:delete" &&
            action !== "org:address:update" &&
            action !== "billing:manage",
    ),
    // audit:read is deliberately OWNER/ADMIN-only, so MEMBER (read-only floor)
    // does NOT include it. media:read IS in the floor; media:write is not.
    // site:read IS in the floor; site:create/update/delete are not.
    MEMBER: [
        "org:read",
        "member:read",
        "store:read",
        "product-review:read",
        "site:read",
        "media:read",
        // ADR-003: every role may read effective module availability.
        "module:read",
        // The diary: a Member sees appointments, services and who is booked,
        // never leads, the pipeline or money.
        "booking:read",
        "service:read",
        "contact:read",
        // DEC-024: the kitchen — move an order's stage, see no money.
        "order:stage",
        // DEC-170: the front desk — book, mark who came, move and cancel,
        // and keep anyone's hours and time off. Still no money.
        "booking:write",
        "hours:write",
        // DEC-170, #1038: the alerts addressed to them alone, never the
        // business's inbox.
        "notification:read-own",
    ],
    /*
     * REVIEWER is website-only (#193) and is NOT a narrower MEMBER: it holds
     * two actions MEMBER lacks (site:comment, site:approve) and lacks four
     * MEMBER has (org/member/store/media:read). Written out in full here for
     * the same reason as the rest of this table — so the test pins the
     * intended set rather than mirroring whatever the implementation does.
     */
    REVIEWER: ["site:read", "site:comment", "site:approve"],
};

function ctx(role: OrgRole): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

describe("organization-policy: can()", () => {
    it("covers the full role x action matrix", () => {
        for (const role of ORG_ROLES) {
            const allowed = new Set(EXPECTED[role]);
            for (const action of ORG_ACTIONS) {
                expect(can(role, action)).toBe(allowed.has(action));
            }
        }
    });

    it("OWNER may perform every action", () => {
        for (const action of ORG_ACTIONS) {
            expect(can("OWNER", action)).toBe(true);
        }
    });

    it("ADMIN may do everything except the three owner-only powers", () => {
        const ownerOnly = [
            "org:delete",
            "org:address:update",
            "billing:manage",
        ];
        expect([...OWNER_ONLY_ACTIONS].sort()).toEqual([...ownerOnly].sort());
        expect(can("ADMIN", "org:delete")).toBe(false);
        expect(can("ADMIN", "org:address:update")).toBe(false);
        expect(can("ADMIN", "billing:manage")).toBe(false);
        for (const action of ORG_ACTIONS.filter(
            (a) => !ownerOnly.includes(a),
        )) {
            expect(can("ADMIN", action)).toBe(true);
        }
    });

    it("only the OWNER may change the web address (DEC-069)", () => {
        expect(can("OWNER", "org:address:update")).toBe(true);
        for (const role of ["ADMIN", "MEMBER", "REVIEWER"] as const) {
            expect(can(role, "org:address:update")).toBe(false);
        }
    });

    it("audit:read is OWNER/ADMIN-only (S1-009)", () => {
        expect(can("OWNER", "audit:read")).toBe(true);
        expect(can("ADMIN", "audit:read")).toBe(true);
        expect(can("MEMBER", "audit:read")).toBe(false);
    });

    it("project:access:manage is OWNER/ADMIN-only (S1-010)", () => {
        expect(can("OWNER", "project:access:manage")).toBe(true);
        expect(can("ADMIN", "project:access:manage")).toBe(true);
        expect(can("MEMBER", "project:access:manage")).toBe(false);
    });

    it("media:read is on the floor; media:write is OWNER/ADMIN-only (S2-008)", () => {
        for (const role of ORG_ROLES) {
            // REVIEWER is off the floor entirely: someone brought in to check
            // one site's copy is not handed the org's media library.
            expect(can(role, "media:read")).toBe(role !== "REVIEWER");
        }
        expect(can("OWNER", "media:write")).toBe(true);
        expect(can("ADMIN", "media:write")).toBe(true);
        expect(can("MEMBER", "media:write")).toBe(false);
    });

    it("site:read is on the floor; site create/update/delete are OWNER/ADMIN-only (S2-003)", () => {
        for (const role of ORG_ROLES) {
            expect(can(role, "site:read")).toBe(true);
        }
        for (const action of [
            "site:create",
            "site:update",
            "site:delete",
        ] as const) {
            expect(can("OWNER", action)).toBe(true);
            expect(can("ADMIN", action)).toBe(true);
            expect(can("MEMBER", action)).toBe(false);
        }
    });

    it("MEMBER holds the floor and its few writes, and nothing else", () => {
        const writeActions = ORG_ACTIONS.filter(
            (a) => !EXPECTED.MEMBER.includes(a),
        );
        for (const action of EXPECTED.MEMBER) {
            expect(can("MEMBER", action)).toBe(true);
        }
        for (const action of writeActions) {
            expect(can("MEMBER", action)).toBe(false);
        }
    });
});

describe("the kitchen (DEC-024)", () => {
    it("a Member moves stages, reads no order money and changes nothing else", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
            expect(can(role, "order:stage")).toBe(true);
        }
        expect(can("REVIEWER", "order:stage")).toBe(false);
        for (const action of [
            "order:read",
            "order:write",
            "payment:read",
            "payment:manage",
            "invoice:read",
        ] as const) {
            expect(can("MEMBER", action)).toBe(false);
        }
    });
});

describe("organization-policy: authorize()", () => {
    it("returns silently when the role permits the action", () => {
        expect(() => authorize(ctx("MEMBER"), "org:read")).not.toThrow();
        expect(() => authorize(ctx("ADMIN"), "store:write")).not.toThrow();
        expect(() => authorize(ctx("OWNER"), "org:delete")).not.toThrow();
    });

    it("throws ForbiddenException for every denied role/action pair", () => {
        for (const role of ORG_ROLES) {
            const allowed = new Set(EXPECTED[role]);
            for (const action of ORG_ACTIONS) {
                if (allowed.has(action)) continue;
                expect(() => authorize(ctx(role), action)).toThrow(
                    ForbiddenException,
                );
            }
        }
    });

    /** What a refused `authorize` threw, as the exception filter reads it. */
    function refused(run: () => void): {
        status: number;
        body: { message: string; details: unknown };
    } {
        try {
            run();
        } catch (error) {
            if (error instanceof ForbiddenException) {
                return {
                    status: error.getStatus(),
                    body: error.getResponse() as {
                        message: string;
                        details: unknown;
                    },
                };
            }
            throw error;
        }
        throw new Error("was not refused");
    }

    it("refuses in a sentence a person can read, never a role or a key", () => {
        const { status, body } = refused(() =>
            authorize(ctx("MEMBER"), "store:create"),
        );
        expect(status).toBe(403);
        expect(body.message).toBe(ROLE_DENIED_MESSAGE);
        expect(body.message).toBe(
            "Your role can't do this. An owner or admin can change that in Settings \u203a Team.",
        );
        expect(body.message).not.toMatch(/MEMBER|store:create|may not perform/);
    });

    it("says which permission was missing in details, for the app", () => {
        expect(
            refused(() => authorize(ctx("MEMBER"), "store:create")).body
                .details,
        ).toEqual({ code: ROLE_DENIED, action: "store:create" });
        expect(ROLE_DENIED).toBe("ROLE_DENIED");
    });

    it("never names a role the business made up", () => {
        const clerk: OrganizationContext = {
            ...ctx("MEMBER"),
            roleKey: "stock-clerk",
            actions: new Set<OrgAction>(["order:read"]),
        };
        const { body } = refused(() => authorize(clerk, "order:refund"));
        expect(body.message).toBe(ROLE_DENIED_MESSAGE);
        expect(JSON.stringify(body)).not.toMatch(/stock-clerk/);
        expect(body.details).toEqual({
            code: "ROLE_DENIED",
            action: "order:refund",
        });
    });
});

describe("Plan and billing (DEC-014, DEC-131 amended 2026-10-11)", () => {
    // The app's Settings tab, its page and every plan prompt ask these two
    // (`lib/billing/plan-access.ts` in app.saroh.in). Changing who holds
    // them here changes who is offered the page and the way to a plan.
    it("is read by Owner and Admin, and by nobody else", () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            expect(can(role, "billing:read")).toBe(true);
        }
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            expect(can(role, "billing:read")).toBe(false);
        }
    });

    it("is changed by the Owner alone: an Admin reads it and changes nothing", () => {
        expect(can("OWNER", "billing:manage")).toBe(true);
        for (const role of ["ADMIN", "MEMBER", "REVIEWER"] as const) {
            expect(can(role, "billing:manage")).toBe(false);
        }
        expect(() => authorize(ctx("OWNER"), "billing:manage")).not.toThrow();
        expect(() => authorize(ctx("ADMIN"), "billing:read")).not.toThrow();
    });

    it("refuses an Admin in the owner-only sentence, with the permission in details", () => {
        let thrown: unknown;
        try {
            authorize(ctx("ADMIN"), "billing:manage");
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(ForbiddenException);
        const refusal = thrown as ForbiddenException;
        expect(refusal.getStatus()).toBe(403);
        expect(refusal.getResponse()).toEqual(roleDenial("billing:manage"));
        expect(roleDenial("billing:manage")).toEqual({
            message: "Only the owner can change the plan.",
            details: { code: "ROLE_DENIED", action: "billing:manage" },
        });
        expect(PLAN_OWNER_ONLY_MESSAGE).toMatch(/^Only the owner can /);
    });

    it("never sends an owner-only refusal to Settings, where no role can be given it", () => {
        for (const action of OWNER_ONLY_ACTIONS) {
            const { message } = roleDenial(action);
            expect(message).toMatch(/^Only the owner can /);
            expect(message).not.toMatch(/admin|Team/);
        }
        expect(roleDenial("org:delete").message).toBe(OWNER_ONLY_MESSAGE);
        expect(roleDenial("store:create").message).toBe(ROLE_DENIED_MESSAGE);
    });

    it("an invented role that lists it does not gain it: the stored list is stripped", () => {
        const set = resolveCapabilities("finance", [
            "billing:read",
            "billing:manage",
            "org:delete",
            "org:address:update",
        ]);
        expect([...set]).toEqual(["billing:read"]);
        const finance: OrganizationContext = {
            ...ctx("MEMBER"),
            roleKey: "finance",
            actions: set,
        };
        expect(() => authorize(finance, "billing:manage")).toThrow(
            ForbiddenException,
        );
        expect(() => authorize(finance, "billing:read")).not.toThrow();
    });

    it("a stored row for Admin that lists it does not gain it, and the Owner's keeps it", () => {
        const stored = ["billing:read", "billing:manage"];
        expect(resolveCapabilities("ADMIN", stored).has("billing:manage")).toBe(
            false,
        );
        expect(resolveCapabilities("OWNER", stored).has("billing:manage")).toBe(
            true,
        );
    });

    it("an extra permission cannot grant it, to an Admin or anyone else", () => {
        for (const role of ["ADMIN", "MEMBER", "finance"]) {
            const set = resolveCapabilities(role, null, [
                "billing:manage",
                "invoice:read",
            ]);
            expect(set.has("billing:manage")).toBe(false);
            expect(set.has("invoice:read")).toBe(true);
        }
    });

    it("is beyond an Admin's reach, so an Admin can never hand it on", () => {
        expect(outOfReach(ctx("ADMIN"), ["billing:manage"])).toEqual([
            "billing:manage",
        ]);
        expect(withinReach(ctx("OWNER"), ["billing:manage"])).toBe(true);
    });
});

describe("discount codes", () => {
    it.each([
        ["OWNER", true, true],
        ["ADMIN", true, true],
        ["MEMBER", false, false],
        ["REVIEWER", false, false],
    ] as const)("%s: read %s, write %s", (role, read, write) => {
        expect(can(role, "discount:read")).toBe(read);
        expect(can(role, "discount:write")).toBe(write);
    });

    // Creating an order with a code tells the caller whether that code works
    // and why not. So order:write is, in effect, a way to read codes — and a
    // built-in role that may create orders must be one that may read them.
    it.each(ORG_ROLES)(
        "%s never writes orders without reading discount codes",
        (role) => {
            if (can(role, "order:write")) {
                expect(can(role, "discount:read")).toBe(true);
            }
        },
    );
});

describe("product reviews", () => {
    it.each([
        ["OWNER", true, true],
        ["ADMIN", true, true],
        // Members see reviews — they are about products, which Members see —
        // but reply to, hide and invite nothing.
        ["MEMBER", true, false],
        // "Review" in REVIEWER is site review; product reviews are not theirs.
        ["REVIEWER", false, false],
    ] as const)("%s: read %s, write %s", (role, read, write) => {
        expect(can(role, "product-review:read")).toBe(read);
        expect(can(role, "product-review:write")).toBe(write);
    });
});

describe("subscriptions, invoices, courses and class packs (ADR-007)", () => {
    const ACTIONS = [
        "subscription:read",
        "subscription:write",
        "invoice:read",
        "invoice:write",
        "course:read",
        "course:write",
        "pack:read",
        "pack:sell",
        "pack:write",
    ] as const;

    it.each(ACTIONS)("%s is OWNER/ADMIN-only", (action) => {
        // Who owes what, and what a person has paid for, is not a roster
        // fact: Members and Reviewers see none of it.
        expect(can("OWNER", action)).toBe(true);
        expect(can("ADMIN", action)).toBe(true);
        expect(can("MEMBER", action)).toBe(false);
        expect(can("REVIEWER", action)).toBe(false);
    });
});

describe("reach (F19): nobody grants what they don't hold", () => {
    const manager: OrganizationContext = {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
        roleKey: "manager",
        actions: resolveCapabilities("manager", [
            "member:role:update",
            "store:write",
            "order:read",
        ]),
    };

    it("is within reach when the actor holds every action", () => {
        expect(withinReach(manager, ["order:read", "store:write"])).toBe(true);
        expect(outOfReach(manager, ["order:read"])).toEqual([]);
    });

    it("names exactly the actions the actor lacks, once each", () => {
        expect(
            outOfReach(manager, [
                "payment:manage",
                "order:read",
                "payment:manage",
                "invoice:write",
            ]),
        ).toEqual(["payment:manage", "invoice:write"]);
        expect(withinReach(manager, ["payment:manage"])).toBe(false);
    });

    it("counts implied holds: store:write brings inventory:write", () => {
        expect(withinReach(manager, ["inventory:write"])).toBe(true);
    });

    it("an empty list is always within reach", () => {
        expect(withinReach(ctx("REVIEWER"), [])).toBe(true);
    });

    it("falls back to the shipped map for a context without resolved actions", () => {
        // OWNER holds everything; ADMIN everything except the owner-only
        // powers, so a role holding one is beyond an Admin.
        expect(withinReach(ctx("OWNER"), ORG_ACTIONS)).toBe(true);
        expect(outOfReach(ctx("ADMIN"), ORG_ACTIONS).sort()).toEqual(
            ["billing:manage", "org:address:update", "org:delete"].sort(),
        );
        expect(withinReach(ctx("MEMBER"), ["payment:manage"])).toBe(false);
    });
});

describe("customer:merge (DEC-042, C9)", () => {
    it("is Owner's and Admin's, never a Member's or a Reviewer's", () => {
        expect(can("OWNER", "customer:merge")).toBe(true);
        expect(can("ADMIN", "customer:merge")).toBe(true);
        expect(can("MEMBER", "customer:merge")).toBe(false);
        expect(can("REVIEWER", "customer:merge")).toBe(false);
    });

    it("is not implied by contact:write: a saved role that edits customers can't merge them", () => {
        const editor = resolveCapabilities("front-desk", [
            "contact:read",
            "contact:write",
        ]);
        expect(editor.has("contact:write")).toBe(true);
        expect(editor.has("customer:merge")).toBe(false);
    });

    it("is granted only within the granter's reach", () => {
        const merger = resolveCapabilities("merger", ["customer:merge"]);
        expect(merger.has("customer:merge")).toBe(true);
        const editor: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["contact:write"]),
        };
        expect(outOfReach(editor, merger)).toEqual(["customer:merge"]);
    });
});

describe("customer:remove (DEC-042, C11)", () => {
    it("is Owner's and Admin's, never a Member's or a Reviewer's", () => {
        expect(can("OWNER", "customer:remove")).toBe(true);
        expect(can("ADMIN", "customer:remove")).toBe(true);
        expect(can("MEMBER", "customer:remove")).toBe(false);
        expect(can("REVIEWER", "customer:remove")).toBe(false);
    });

    it("is not implied by contact:write or customer:merge", () => {
        const editor = resolveCapabilities("front-desk", [
            "contact:read",
            "contact:write",
            "customer:merge",
        ]);
        expect(editor.has("contact:write")).toBe(true);
        expect(editor.has("customer:remove")).toBe(false);
    });

    it("is granted only within the granter's reach", () => {
        const remover = resolveCapabilities("remover", ["customer:remove"]);
        expect(remover.has("customer:remove")).toBe(true);
        const editor: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["contact:write"]),
        };
        expect(outOfReach(editor, remover)).toEqual(["customer:remove"]);
    });
});

describe("the split order powers (DEC-039, B16)", () => {
    const parts = [
        "order:create",
        "order:edit",
        "order:refund",
        "order:export",
    ] as const;

    it("are Owner's and Admin's; the Member and Reviewer bundles don't change here (F18)", () => {
        for (const part of parts) {
            expect(can("OWNER", part)).toBe(true);
            expect(can("ADMIN", part)).toBe(true);
            expect(can("MEMBER", part)).toBe(false);
            expect(can("REVIEWER", part)).toBe(false);
        }
    });

    it("a saved order:write role is judged on its parts when someone edits it", () => {
        // A Manager holding only order:read can't edit a role that takes and
        // changes orders — its implied parts count against them.
        const manager: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "manager",
            actions: resolveCapabilities("manager", [
                "member:role:update",
                "order:read",
            ]),
        };
        expect(
            outOfReach(manager, resolveCapabilities("senior", ["order:write"])),
        ).toEqual([
            "order:write",
            "order:create",
            "order:edit",
            "order:export",
        ]);
    });

    it("a granter holding payment:manage may grant order:refund (it is implied)", () => {
        const cashier: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "cashier",
            actions: resolveCapabilities("cashier", [
                "member:role:update",
                "payment:manage",
            ]),
        };
        expect(withinReach(cashier, ["order:refund", "order:read"])).toBe(true);
    });
});

/**
 * The customer rows of the permission matrix (DEC-039, C13; matrix §2 and
 * §4). Each row here is one line of the matrix page, so the page and the
 * policy can't drift apart.
 */
describe("the customer capabilities (DEC-039, C13)", () => {
    const BUNDLES: [OrgAction, Record<OrgRole, boolean>][] = [
        [
            "contact:read",
            { OWNER: true, ADMIN: true, MEMBER: true, REVIEWER: false },
        ],
        [
            "contact:write",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        [
            "customer:sensitive",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        [
            "customer:merge",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        [
            "customer:remove",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
    ];

    it.each(BUNDLES)(
        "%s follows matrix §4's default bundles",
        (action, want) => {
            for (const role of ORG_ROLES) {
                expect(can(role, action)).toBe(want[role]);
            }
        },
    );

    it("contact:write implies contact:read, so a role saved with only the write still sees", () => {
        const set = resolveCapabilities("editor", ["contact:write"]);
        expect([...set].sort()).toEqual(["contact:read", "contact:write"]);
    });

    it("nothing implies customer:sensitive, merge or remove", () => {
        const set = resolveCapabilities("front-desk", [
            "contact:write",
            "booking:write",
            "order:write",
            "payment:manage",
        ]);
        for (const action of [
            "customer:sensitive",
            "customer:merge",
            "customer:remove",
        ] as const) {
            expect(set.has(action)).toBe(false);
        }
    });

    it("a Practitioner holds customer:sensitive and contact:read, and can't edit", () => {
        const practitioner: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "practitioner",
            actions: resolveCapabilities("practitioner", [
                "booking:read",
                "service:read",
                "contact:read",
                "customer:sensitive",
            ]),
        };
        expect(() =>
            authorize(practitioner, "customer:sensitive"),
        ).not.toThrow();
        expect(() => authorize(practitioner, "contact:write")).toThrow(
            ForbiddenException,
        );
    });

    it("is granted only within the granter's reach", () => {
        const editor: OrganizationContext = {
            organizationId: "org",
            userId: "u",
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", [
                "member:role:update",
                "contact:write",
            ]),
        };
        expect(
            outOfReach(
                editor,
                resolveCapabilities("practitioner", [
                    "contact:read",
                    "customer:sensitive",
                ]),
            ),
        ).toEqual(["customer:sensitive"]);
        // The read it implies is theirs to give.
        expect(withinReach(editor, ["contact:read"])).toBe(true);
    });
});

describe("the booking and class-pack capabilities (DEC-039, E26)", () => {
    const BUNDLES: [OrgAction, Record<OrgRole, boolean>][] = [
        [
            "booking:read",
            { OWNER: true, ADMIN: true, MEMBER: true, REVIEWER: false },
        ],
        [
            "service:read",
            { OWNER: true, ADMIN: true, MEMBER: true, REVIEWER: false },
        ],
        // The front desk (DEC-170): a Member books, marks who came, moves,
        // cancels and keeps hours; setting up services stays with
        // service:write.
        [
            "booking:write",
            { OWNER: true, ADMIN: true, MEMBER: true, REVIEWER: false },
        ],
        [
            "hours:write",
            { OWNER: true, ADMIN: true, MEMBER: true, REVIEWER: false },
        ],
        [
            "service:write",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        // Whether a Member holds pack:read and pack:sell is F18's (Q1).
        [
            "pack:read",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        [
            "pack:sell",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
        [
            "pack:write",
            { OWNER: true, ADMIN: true, MEMBER: false, REVIEWER: false },
        ],
    ];

    it.each(BUNDLES)(
        "%s follows matrix §4's default bundles",
        (action, want) => {
            for (const role of ORG_ROLES) {
                expect(can(role, action)).toBe(want[role]);
            }
        },
    );

    const role = (key: string, actions: string[]): OrganizationContext => ({
        organizationId: "org",
        userId: "u",
        role: "MEMBER",
        roleKey: key,
        actions: resolveCapabilities(key, actions),
    });

    it("a role with pack:sell alone can sell and see packs, and can't change them", () => {
        const trainer = role("trainer", ["pack:sell"]);
        expect(() => authorize(trainer, "pack:sell")).not.toThrow();
        expect(() => authorize(trainer, "pack:read")).not.toThrow();
        expect(() => authorize(trainer, "pack:write")).toThrow(
            ForbiddenException,
        );
    });

    it("a role saved with pack:write before the split still sells, and sees", () => {
        const set = resolveCapabilities("packs-lead", ["pack:write"]);
        expect([...set].sort()).toEqual(
            ["pack:read", "pack:sell", "pack:write"].sort(),
        );
    });

    it("pack:read alone shows the whole pack and sells nothing", () => {
        const set = resolveCapabilities("viewer", ["pack:read"]);
        expect([...set]).toEqual(["pack:read"]);
    });

    it("booking:write and service:write imply their reads, and nothing more", () => {
        expect(
            [...resolveCapabilities("desk", ["booking:write"])].sort(),
        ).toEqual(["booking:read", "booking:write"]);
        // service:write always covered hours and time off (DEC-170).
        expect(
            [...resolveCapabilities("setup", ["service:write"])].sort(),
        ).toEqual(["hours:write", "service:read", "service:write"]);
    });

    it("hours:write alone sets hours and time off, and sets nothing up (DEC-170)", () => {
        const hours = role("hours", ["hours:write"]);
        expect(
            [...resolveCapabilities("hours", ["hours:write"])].sort(),
        ).toEqual(["hours:write", "service:read"]);
        expect(() => authorize(hours, "hours:write")).not.toThrow();
        expect(() => authorize(hours, "service:write")).toThrow(
            ForbiddenException,
        );
        expect(() => authorize(hours, "booking:write")).toThrow(
            ForbiddenException,
        );
    });

    it("a Member works the front desk and takes no money (DEC-170, DEC-098)", () => {
        for (const action of ["booking:write", "hours:write"] as const) {
            expect(can("MEMBER", action)).toBe(true);
        }
        for (const action of [
            "service:write",
            "invoice:write",
            "payment:manage",
            "pack:sell",
        ] as const) {
            expect(can("MEMBER", action)).toBe(false);
        }
        expect(can("REVIEWER", "booking:write")).toBe(false);
        expect(can("REVIEWER", "hours:write")).toBe(false);
    });

    it("no booking power implies a pack power, nor the other way round", () => {
        const desk = resolveCapabilities("desk", [
            "booking:write",
            "service:write",
        ]);
        expect(desk.has("pack:read")).toBe(false);
        expect(desk.has("pack:sell")).toBe(false);
        const seller = resolveCapabilities("seller", ["pack:write"]);
        expect(seller.has("booking:write")).toBe(false);
        expect(seller.has("booking:read")).toBe(false);
    });

    it("the Front desk template (matrix §4) books and sells, and changes no set-up", () => {
        const desk = role("front-desk", [
            "booking:write",
            "order:stage",
            "order:create",
            "contact:write",
            "pack:sell",
        ]);
        for (const action of [
            "booking:read",
            "booking:write",
            "pack:read",
            "pack:sell",
        ] as const) {
            expect(() => authorize(desk, action)).not.toThrow();
        }
        for (const action of ["service:write", "pack:write"] as const) {
            expect(() => authorize(desk, action)).toThrow(ForbiddenException);
        }
    });

    it("pack:sell is granted only within the granter's reach", () => {
        const lead = role("lead", ["member:role:update", "pack:sell"]);
        expect(
            outOfReach(lead, resolveCapabilities("editor", ["pack:write"])),
        ).toEqual(["pack:write"]);
        // What pack:sell implies is theirs to give.
        expect(
            withinReach(lead, resolveCapabilities("seller", ["pack:sell"])),
        ).toBe(true);
    });
});
