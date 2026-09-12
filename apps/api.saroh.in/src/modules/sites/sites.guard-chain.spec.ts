/**
 * The whole chain a website request passes through, for every role (#287).
 *
 * Four things decide whether a person may do something to a site, and each is
 * tested on its own: `better-auth.guard.spec.ts` proves the session check,
 * `organization-policy.spec.ts` proves the role → action map,
 * `module-enforcement.roles.spec.ts` proves which roles reach the WEBSITE
 * module, and the service specs prove what each method does once called.
 *
 * Nothing proved they COMPOSE. That is not a theoretical gap: the WEBSITE
 * module shipped gated on `site:update`, so with `MODULE_ENFORCEMENT` on, a
 * REVIEWER — a role that exists to read a site and leave notes on it — got 404
 * from every website route including Review (#274). Every individual piece was
 * correct and passing. The composition was wrong, and no test could see it.
 *
 * So this one runs them in the order a request meets them, with only I/O faked:
 *
 *   BetterAuthGuard        session → `request.user`      (auth stubbed)
 *   OrganizationGuard      membership row → role         (REAL, Prisma faked)
 *   ModuleEnforcementGuard role → WEBSITE availability   (REAL service behind it)
 *   the service method     role → action                 (REAL policy)
 *
 * The membership row is the input: a role is not asserted into the context, it
 * is READ from a row the way production reads it. What each test names is the
 * thing a merchant would say — "invite someone to review my site and they can
 * leave a note but not publish" — and the chain is what has to deliver it.
 */

jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        membership: { findUnique: jest.fn() },
        organization: { findUnique: jest.fn() },
        site: { findFirst: jest.fn(), findMany: jest.fn() },
    },
}));

const getSession = jest.fn();
jest.mock("../../common/auth/auth", () => ({ auth: { api: { getSession } } }));
jest.mock("@saroh/auth", () => ({
    getTrustedOrigins: () => ["https://app.saroh.in"],
}));
jest.mock("better-auth/node", () => ({ fromNodeHeaders: (h: unknown) => h }));

import type { ExecutionContext } from "@nestjs/common";
import {
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import type { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { SitesController } from "./sites.controller";
import { SitesService } from "./sites.service";

const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const organizationFindUnique = prisma.organization.findUnique as jest.Mock;
const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteFindMany = prisma.site.findMany as jest.Mock;

const ORG = "org_1";
const USER = "user_1";
const SITE = "site_1";

/**
 * Every gate except authorization is open.
 *
 * The module is installed, rolled out, entitled and ready, so the only thing
 * that can refuse a request here is who the caller is — which is the question
 * this file asks. A fake that also failed on entitlement would answer it by
 * accident.
 */
function moduleGuard(): ModuleEnforcementGuard {
    const availability = new ModuleAvailabilityService(
        {
            isEnabled: jest.fn().mockResolvedValue(true),
        } as unknown as FeatureFlagService,
        {
            can: jest.fn().mockResolvedValue(true),
        } as unknown as EntitlementService,
        {
            evaluate: jest
                .fn()
                .mockResolvedValue({ readiness: "ACTIVE", blockers: [] }),
        } as unknown as ModuleReadinessRegistry,
        {
            organizationModule: {
                findUnique: jest.fn().mockResolvedValue({ status: "ENABLED" }),
            },
            projectModule: { count: jest.fn().mockResolvedValue(1) },
        } as never,
    );
    return new ModuleEnforcementGuard(
        new Reflector(),
        availability,
        new OrganizationContextService(),
    );
}

/** A request as it arrives: a cookie, an org header, nothing else. */
function request(method = "GET") {
    return {
        method,
        headers: {
            origin: "https://app.saroh.in",
            "x-organization-id": ORG,
            cookie: "better-auth.session_token=whatever",
        },
        params: {} as Record<string, string | undefined>,
    };
}

/**
 * The context the guards read, pointed at a REAL controller handler.
 *
 * This matters more than it looks. `ModuleEnforcementGuard` asks a Reflector
 * for `@RequireModule` on the handler and the class, so a stand-in class would
 * carry no annotation, the guard would allow everything, and the module gate —
 * the piece that broke in #274 — would be silently absent from the chain this
 * file claims to test. Reading it off `SitesController` is what makes the gate
 * real here.
 */
function execution(
    req: object,
    handler: keyof SitesController = "list",
): ExecutionContext {
    return {
        getHandler: () => SitesController.prototype[handler],
        getClass: () => SitesController,
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

/**
 * Run the three guards in order and hand the resolved context to `op`.
 *
 * Returns whatever `op` returns, and lets every exception through — a test that
 * caught them could not tell a refusal from a fault.
 */
async function throughChain<T>(
    method: string,
    op: (ctx: OrganizationContext) => Promise<T>,
    handler: keyof SitesController = "list",
): Promise<T> {
    const req = request(method);
    const ctx = execution(req, handler);

    await new BetterAuthGuard().canActivate(ctx);
    await new OrganizationGuard(new OrganizationContextService()).canActivate(
        ctx,
    );
    await moduleGuard().canActivate(ctx);

    const resolved = (req as { organizationContext?: OrganizationContext })
        .organizationContext;
    if (!resolved) throw new Error("the chain attached no context");
    return op(resolved);
}

/** The membership row the OrganizationGuard will read for this test. */
function signedInAs(role: OrgRole | null) {
    membershipFindUnique.mockResolvedValue(role ? { role } : null);
    organizationFindUnique.mockResolvedValue({ id: ORG });
}

/**
 * A marker for "authorization let this through".
 *
 * Every operation below reaches `prisma.site.findFirst`/`findMany` as its first
 * database touch after `authorize()`. Rejecting there says the chain admitted
 * the caller and the method began its own work — which is all this file claims.
 * What each method then DOES is its own spec's job, and faking a publish well
 * enough to succeed here would make this a worse test of the thing it is for.
 */
class PastTheGate extends Error {
    constructor() {
        super("reached the service body");
    }
}

const REVIEWER_SCOPE = { reviewers: { some: { userId: USER } } };

const service = () => new SitesService({} as EntitlementService);

interface Operation {
    /** What a merchant would call it. */
    what: string;
    method: string;
    /** The controller handler that serves it, so the guards read real metadata. */
    handler: keyof SitesController;
    run: (ctx: OrganizationContext) => Promise<unknown>;
    /** The roles that may do it. Every other role must be refused. */
    allowed: readonly OrgRole[];
}

const OPERATIONS: readonly Operation[] = [
    {
        what: "list the org's websites",
        handler: "list",
        method: "GET",
        run: (ctx) => service().listSites(ctx),
        allowed: ["OWNER", "ADMIN", "MEMBER", "REVIEWER"],
    },
    {
        what: "open one website",
        handler: "get",
        method: "GET",
        run: (ctx) => service().getSite(ctx, SITE),
        allowed: ["OWNER", "ADMIN", "MEMBER", "REVIEWER"],
    },
    {
        what: "see where the review stands",
        handler: "getReviewState",
        method: "GET",
        run: (ctx) => service().getReviewState(ctx, SITE),
        allowed: ["OWNER", "ADMIN", "MEMBER", "REVIEWER"],
    },
    {
        what: "read the notes on a website",
        handler: "listComments",
        method: "GET",
        run: (ctx) => service().listComments(ctx, SITE),
        allowed: ["OWNER", "ADMIN", "MEMBER", "REVIEWER"],
    },
    {
        what: "leave a note",
        handler: "createComment",
        method: "POST",
        run: (ctx) =>
            service().createComment(ctx, SITE, {
                pageId: "page_1",
                sectionKey: "hero",
                body: "The hours are wrong",
            }),
        // Not MEMBER: leaving a note is not a read (#193).
        allowed: ["OWNER", "ADMIN", "REVIEWER"],
    },
    {
        what: "sign a website off",
        handler: "createApproval",
        method: "POST",
        run: (ctx) =>
            service().createApproval(ctx, SITE, { outcome: "APPROVED" }),
        allowed: ["OWNER", "ADMIN", "REVIEWER"],
    },
    {
        what: "change the search settings",
        handler: "updateSettings",
        method: "PATCH",
        run: (ctx) => service().updateSettings(ctx, SITE, { seoTitle: "Hi" }),
        allowed: ["OWNER", "ADMIN"],
    },
    {
        what: "save a page's draft",
        handler: "replaceDraftSections",
        method: "PUT",
        run: (ctx) =>
            service().replaceDraftSections(ctx, SITE, "page_1", {
                sections: [],
            }),
        // The one a REVIEWER must never have: they say what they think, the
        // owner decides.
        allowed: ["OWNER", "ADMIN"],
    },
    {
        what: "publish",
        handler: "publish",
        method: "POST",
        run: (ctx) => service().publishSite(ctx, SITE),
        allowed: ["OWNER", "ADMIN"],
    },
    {
        what: "restore an older publication",
        handler: "restorePublication",
        method: "POST",
        run: (ctx) => service().restorePublication(ctx, SITE, "pub_1"),
        allowed: ["OWNER", "ADMIN"],
    },
];

const ROLES: readonly OrgRole[] = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"];

describe("a website request, through the real guard chain", () => {
    const previousEnforcement = process.env.MODULE_ENFORCEMENT;

    beforeEach(() => {
        jest.clearAllMocks();
        // On, not dark. Dark is the state this chain has been tested in so far,
        // and it is the state the #274 bug was invisible in.
        process.env.MODULE_ENFORCEMENT = "1";
        getSession.mockResolvedValue({
            session: { id: "sess_1" },
            user: { id: USER, email: "a@b.com", emailVerified: true },
        });
        siteFindFirst.mockRejectedValue(new PastTheGate());
        siteFindMany.mockRejectedValue(new PastTheGate());
    });

    afterEach(() => {
        if (previousEnforcement === undefined)
            delete process.env.MODULE_ENFORCEMENT;
        else process.env.MODULE_ENFORCEMENT = previousEnforcement;
    });

    describe.each(ROLES)("as %s", (role) => {
        beforeEach(() => {
            signedInAs(role);
        });

        it.each(OPERATIONS.map((op) => [op.what, op] as const))(
            "%s",
            async (_what, op) => {
                const result = throughChain(op.method, op.run, op.handler);
                if (op.allowed.includes(role)) {
                    await expect(result).rejects.toBeInstanceOf(PastTheGate);
                } else {
                    await expect(result).rejects.toBeInstanceOf(
                        ForbiddenException,
                    );
                }
            },
        );
    });

    /*
     * Getting past the policy is not the same as being shown a site. A REVIEWER
     * holds org-wide `site:read` — the policy cannot say "this site" — so the
     * narrowing to the sites they were invited to happens in the query (#276).
     * Without it, someone invited to check one page could list every site the
     * business has.
     */
    describe("what a reviewer's queries are scoped to", () => {
        it("asks only for the sites this reviewer was invited to", async () => {
            signedInAs("REVIEWER");
            await expect(
                throughChain("GET", (ctx) => service().listSites(ctx)),
            ).rejects.toBeInstanceOf(PastTheGate);

            expect(siteFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining(REVIEWER_SCOPE),
                }),
            );
        });

        it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
            "does not narrow the list for %s",
            async (role) => {
                signedInAs(role);
                await expect(
                    throughChain("GET", (ctx) => service().listSites(ctx)),
                ).rejects.toBeInstanceOf(PastTheGate);

                const where = siteFindMany.mock.calls[0]?.[0]?.where as object;
                expect(where).not.toHaveProperty("reviewers");
            },
        );

        it("404s a site the reviewer was not invited to, and does not say it exists", async () => {
            signedInAs("REVIEWER");
            // No grant → the scoped lookup finds nothing.
            siteFindFirst.mockResolvedValue(null);

            await expect(
                throughChain("GET", (ctx) =>
                    service().getReviewState(ctx, SITE),
                ),
            ).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    /*
     * The steps before the role is even known. A test per role above assumes
     * the chain got that far; these two are why it does.
     */
    describe("before a role exists", () => {
        it("refuses a request with no session, without reading a membership", async () => {
            signedInAs("OWNER");
            getSession.mockResolvedValue(null);

            await expect(
                throughChain("GET", (ctx) => service().listSites(ctx)),
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(membershipFindUnique).not.toHaveBeenCalled();
        });

        it("refuses a signed-in stranger to the organization with 403, not 404", async () => {
            // The org exists, they are simply not in it — a distinction the
            // resolver makes deliberately, so a legitimate multi-org client can
            // tell "request access" from "wrong link".
            signedInAs(null);

            await expect(
                throughChain("GET", (ctx) => service().listSites(ctx)),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("404s an organization that does not exist", async () => {
            signedInAs(null);
            organizationFindUnique.mockResolvedValue(null);

            await expect(
                throughChain("GET", (ctx) => service().listSites(ctx)),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it("refuses a mutating request from an untrusted origin", async () => {
            signedInAs("OWNER");
            const req = {
                ...request("POST"),
                headers: { origin: "https://evil.example" },
            };

            await expect(
                new BetterAuthGuard().canActivate(execution(req)),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });

    /*
     * The bug this file exists for. Every role above was tested with
     * enforcement ON; this pins the answer so that switching the kill-switch
     * cannot change who may reach the module — which is exactly what it did
     * when the gate named a write action.
     */
    it("lets a reviewer reach review whether enforcement is on or off", async () => {
        signedInAs("REVIEWER");
        for (const enforcement of ["1", undefined]) {
            if (enforcement === undefined)
                delete process.env.MODULE_ENFORCEMENT;
            else process.env.MODULE_ENFORCEMENT = enforcement;

            await expect(
                throughChain("GET", (ctx) =>
                    service().getReviewState(ctx, SITE),
                ),
            ).rejects.toBeInstanceOf(PastTheGate);
        }
    });
});
