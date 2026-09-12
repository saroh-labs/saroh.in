import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

// Stubbed for the same reason `capabilities.controller.spec.ts` stubs them:
// importing the controller otherwise pulls in better-auth's ESM, which ts-jest
// cannot transform. The guard ASSERTION below therefore proves which guards the
// decorator names and in what order — not what those guards do, which
// `module-enforcement.roles.spec.ts` covers.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import type { OrganizationContext } from "../../common/types/organization-context";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import type { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesController } from "./sites.controller";
import type { SitesService } from "./sites.service";

/**
 * What the routes are wired to (#287).
 *
 * The policy is thoroughly tested and the paths to it were not. Every
 * `authorize()` call lives in a service method, so a route pointed at the
 * wrong method is a permission check that silently does not apply — and
 * nothing proved the pointing. Doc comments were no evidence either: three of
 * them sat above the wrong route until #290 moved them.
 *
 * So this asserts the two facts a handler is: the HTTP method and path it
 * answers, and the service call it makes with which arguments, in order.
 *
 * It deliberately does NOT boot Nest. This is a wiring table — a list of what
 * each route promises — and it should fail for exactly one reason: someone
 * changed a route or a call without changing the table.
 */

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

/** Stand-ins, distinct so a swapped argument cannot pass unnoticed. */
const SITE = "site_1";
const PAGE = "page_1";
const COMMENT = "comment_1";
const LINK = "link_1";
const PUBLICATION = "pub_1";
const DTO = { marker: "dto" } as never;

type Target = "sites" | "previewLinks";

interface Route {
    /** The controller method. */
    handler: keyof SitesController;
    method: RequestMethod;
    path: string;
    /** Which injected service it forwards to, and how. */
    target: Target;
    call: string;
    /** Arguments given to the handler, then expected on the service. */
    args: unknown[];
    expect: unknown[];
}

/*
 * Every route on the controller. A new one that is not listed here fails the
 * completeness test at the bottom, which is the point: a route nobody wrote
 * down is a route nobody checked the guard chain of.
 */
const ROUTES: Route[] = [
    {
        handler: "create",
        method: RequestMethod.POST,
        // Nest stores a bare `@Post()` as "/", not "".
        path: "/",
        target: "sites",
        call: "createFromTemplate",
        args: [ctx, DTO],
        expect: [ctx, DTO],
    },
    {
        handler: "list",
        method: RequestMethod.GET,
        path: "/",
        target: "sites",
        call: "listSites",
        args: [ctx],
        expect: [ctx],
    },
    {
        handler: "get",
        method: RequestMethod.GET,
        path: ":siteId",
        target: "sites",
        call: "getSite",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "listComments",
        method: RequestMethod.GET,
        path: ":siteId/comments",
        target: "sites",
        call: "listComments",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "createComment",
        method: RequestMethod.POST,
        path: ":siteId/comments",
        target: "sites",
        call: "createComment",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "setCommentResolved",
        method: RequestMethod.PATCH,
        path: ":siteId/comments/:commentId",
        target: "sites",
        call: "setCommentResolved",
        // The handler unwraps the DTO: the service takes the boolean.
        args: [ctx, SITE, COMMENT, { resolved: true } as never],
        expect: [ctx, SITE, COMMENT, true],
    },
    {
        handler: "requestReview",
        method: RequestMethod.POST,
        path: ":siteId/review/request",
        target: "sites",
        call: "requestReview",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "createApproval",
        method: RequestMethod.POST,
        path: ":siteId/approvals",
        target: "sites",
        call: "createApproval",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "createPreviewLink",
        method: RequestMethod.POST,
        path: ":siteId/preview-links",
        target: "previewLinks",
        call: "create",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "listPreviewLinks",
        method: RequestMethod.GET,
        path: ":siteId/preview-links",
        target: "previewLinks",
        call: "list",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "revokePreviewLink",
        method: RequestMethod.DELETE,
        path: ":siteId/preview-links/:linkId",
        target: "previewLinks",
        call: "revoke",
        args: [ctx, SITE, LINK],
        expect: [ctx, SITE, LINK],
    },
    {
        handler: "getReviewState",
        method: RequestMethod.GET,
        path: ":siteId/review",
        target: "sites",
        call: "getReviewState",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "getFlags",
        method: RequestMethod.GET,
        path: ":siteId/flags",
        target: "sites",
        call: "getSiteFlags",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "createPage",
        method: RequestMethod.POST,
        path: ":siteId/pages",
        target: "sites",
        call: "createPage",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "updatePage",
        method: RequestMethod.PATCH,
        path: ":siteId/pages/:pageId",
        target: "sites",
        call: "updatePage",
        args: [ctx, SITE, PAGE, DTO],
        expect: [ctx, SITE, PAGE, DTO],
    },
    {
        handler: "deletePage",
        method: RequestMethod.DELETE,
        path: ":siteId/pages/:pageId",
        target: "sites",
        call: "deletePage",
        args: [ctx, SITE, PAGE],
        expect: [ctx, SITE, PAGE],
    },
    {
        /*
         * The editor's load path: `section:write`, and it CREATES a draft
         * version. The next route is the read a reviewer gets instead, and the
         * two must never be swapped — that is the whole of #275.
         */
        handler: "getDraft",
        method: RequestMethod.GET,
        path: ":siteId/pages/:pageId/draft",
        target: "sites",
        call: "getPageDraft",
        args: [ctx, SITE, PAGE],
        expect: [ctx, SITE, PAGE],
    },
    {
        handler: "getPageForReview",
        method: RequestMethod.GET,
        path: ":siteId/pages/:pageId/read",
        target: "sites",
        call: "getPageForReview",
        args: [ctx, SITE, PAGE],
        expect: [ctx, SITE, PAGE],
    },
    {
        handler: "replaceDraftSections",
        method: RequestMethod.PUT,
        path: ":siteId/pages/:pageId/draft/sections",
        target: "sites",
        call: "replaceDraftSections",
        args: [ctx, SITE, PAGE, DTO],
        expect: [ctx, SITE, PAGE, DTO],
    },
    {
        handler: "updateSettings",
        method: RequestMethod.PATCH,
        path: ":siteId/settings",
        target: "sites",
        call: "updateSettings",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "updateNavigation",
        method: RequestMethod.PUT,
        path: ":siteId/navigation",
        target: "sites",
        call: "updateNavigation",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "updateFooter",
        method: RequestMethod.PUT,
        path: ":siteId/footer",
        target: "sites",
        call: "updateFooter",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "updateStyle",
        method: RequestMethod.PUT,
        path: ":siteId/style",
        target: "sites",
        call: "updateStyle",
        args: [ctx, SITE, DTO],
        expect: [ctx, SITE, DTO],
    },
    {
        handler: "listPublications",
        method: RequestMethod.GET,
        path: ":siteId/publications",
        target: "sites",
        call: "listPublications",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
    {
        handler: "getPublication",
        method: RequestMethod.GET,
        path: ":siteId/publications/:publicationId",
        target: "sites",
        call: "getPublication",
        args: [ctx, SITE, PUBLICATION],
        expect: [ctx, SITE, PUBLICATION],
    },
    {
        handler: "restorePublication",
        method: RequestMethod.POST,
        path: ":siteId/publications/:publicationId/restore",
        target: "sites",
        call: "restorePublication",
        args: [ctx, SITE, PUBLICATION],
        expect: [ctx, SITE, PUBLICATION],
    },
    {
        handler: "publish",
        method: RequestMethod.POST,
        path: ":siteId/publish",
        target: "sites",
        call: "publishSite",
        args: [ctx, SITE],
        expect: [ctx, SITE],
    },
];

function build() {
    const sites = {} as Record<string, jest.Mock>;
    const previewLinks = {} as Record<string, jest.Mock>;
    for (const route of ROUTES) {
        const bag = route.target === "sites" ? sites : previewLinks;
        bag[route.call] = jest.fn().mockReturnValue("called");
    }
    const controller = new SitesController(
        sites as unknown as SitesService,
        previewLinks as unknown as SitePreviewLinksService,
    );
    return { controller, sites, previewLinks };
}

describe("SitesController route wiring (#287)", () => {
    it.each(
        ROUTES.map((r) => [`${r.handler} → ${r.target}.${r.call}`, r] as const),
    )("%s", (_label, route) => {
        const { controller, sites, previewLinks } = build();
        const handler = controller[route.handler] as (
            ...args: unknown[]
        ) => unknown;

        const result = handler.apply(controller, route.args);

        const bag = route.target === "sites" ? sites : previewLinks;
        expect(bag[route.call]).toHaveBeenCalledWith(...route.expect);
        // Returned, not swallowed: a handler that forgets the `return`
        // answers 200 with an empty body while the work still happens.
        expect(result).toBe("called");
    });

    it.each(ROUTES.map((r) => [`${r.handler}`, r] as const))(
        "%s answers the path it is documented at",
        (_label, route) => {
            const handler = SitesController.prototype[route.handler];
            expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
                route.path,
            );
            expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
                route.method,
            );
        },
    );

    it("lists every route the controller has", () => {
        const handlers = Object.getOwnPropertyNames(SitesController.prototype)
            .filter((name) => name !== "constructor")
            .filter((name) =>
                Reflect.hasMetadata(
                    PATH_METADATA,
                    SitesController.prototype[name as keyof SitesController],
                ),
            );

        // `templates` serves a static catalogue and calls no service, so it is
        // the one route with nothing to wire — it is still counted here, so
        // adding a route cannot pass by being forgotten.
        expect(handlers.sort()).toEqual(
            [...ROUTES.map((r) => r.handler), "templates"].sort(),
        );
    });

    it("sits behind the whole guard chain, and the WEBSITE module", () => {
        /*
         * The guards are declared once on the class, so this is what every
         * route above inherits. #274 is what a wrong answer here costs: the
         * module gate refused every website route to two roles, and no test
         * was looking at the chain.
         */
        const guards = Reflect.getMetadata("__guards__", SitesController) as {
            name: string;
        }[];
        expect(guards.map((g) => g.name)).toEqual([
            "BetterAuthGuard",
            "OrganizationGuard",
            "ModuleEnforcementGuard",
        ]);
        expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, SitesController)).toBe(
            "WEBSITE",
        );
        expect(Reflect.getMetadata(PATH_METADATA, SitesController)).toBe(
            "organizations/:organizationId/sites",
        );
    });
});
