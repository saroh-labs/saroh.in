import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

// Stubbed as `sites.controller.spec.ts` stubs them: importing the real guards
// pulls in better-auth's ESM, which ts-jest cannot transform.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import type { OrganizationContext } from "../../common/types/organization-context";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import { TestReleasesController } from "./test-releases.controller";
import type { TestReleasesService } from "./test-releases.service";

/**
 * What each test release route is wired to (DEC-071, T2), the way
 * `sites.controller.spec.ts` pins the site routes (#287): the method and path
 * it answers, and the service call it makes, since every permission check
 * lives in the service method it calls.
 */

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const SITE = "site_1";
const RELEASE = "release_1";
const LINK = "link_1";
const DTO = { marker: "dto" } as never;

interface Route {
    handler: keyof TestReleasesController;
    method: RequestMethod;
    path: string;
    call: keyof TestReleasesService;
    args: unknown[];
}

const ROUTES: readonly Route[] = [
    {
        handler: "create",
        method: RequestMethod.POST,
        path: "/",
        call: "create",
        args: [ctx, SITE, DTO],
    },
    {
        handler: "list",
        method: RequestMethod.GET,
        path: "/",
        call: "list",
        args: [ctx, SITE],
    },
    {
        handler: "update",
        method: RequestMethod.PATCH,
        path: ":releaseId",
        call: "update",
        args: [ctx, SITE, RELEASE, DTO],
    },
    {
        handler: "discard",
        method: RequestMethod.POST,
        path: ":releaseId/discard",
        call: "discard",
        args: [ctx, SITE, RELEASE],
    },
    {
        handler: "createLink",
        method: RequestMethod.POST,
        path: ":releaseId/links",
        call: "createLink",
        args: [ctx, SITE, RELEASE, DTO],
    },
    {
        handler: "open",
        method: RequestMethod.POST,
        path: ":releaseId/open",
        call: "open",
        args: [ctx, SITE, RELEASE],
    },
    {
        handler: "goLive",
        method: RequestMethod.POST,
        path: ":releaseId/go-live",
        call: "goLive",
        args: [ctx, SITE, RELEASE],
    },
    {
        handler: "revokeLink",
        method: RequestMethod.POST,
        path: "links/:linkId/revoke",
        call: "revokeLink",
        args: [ctx, SITE, LINK],
    },
];

function build() {
    const service = {} as Record<string, jest.Mock>;
    for (const route of ROUTES) {
        service[route.call] = jest.fn().mockReturnValue("called");
    }
    const controller = new TestReleasesController(
        service as unknown as TestReleasesService,
    );
    return { controller, service };
}

describe("TestReleasesController route wiring (DEC-071, T2)", () => {
    it.each(ROUTES.map((r) => [`${r.handler} → ${r.call}`, r] as const))(
        "%s",
        (_label, route) => {
            const { controller, service } = build();
            const handler = controller[route.handler] as (
                ...args: unknown[]
            ) => unknown;
            const result = handler.apply(controller, route.args);
            expect(service[route.call]).toHaveBeenCalledWith(...route.args);
            expect(result).toBe("called");
        },
    );

    it.each(ROUTES.map((r) => [r.handler, r] as const))(
        "%s answers the path it is documented at",
        (_label, route) => {
            const handler = TestReleasesController.prototype[route.handler];
            expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
                route.path,
            );
            expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
                route.method,
            );
        },
    );

    it("lists every route the controller has", () => {
        const handlers = Object.getOwnPropertyNames(
            TestReleasesController.prototype,
        ).filter(
            (name) =>
                name !== "constructor" &&
                Reflect.hasMetadata(
                    PATH_METADATA,
                    TestReleasesController.prototype[
                        name as keyof TestReleasesController
                    ],
                ),
        );
        expect(handlers.sort()).toEqual(ROUTES.map((r) => r.handler).sort());
    });

    it("sits behind the whole guard chain, and the WEBSITE module", () => {
        const guards = Reflect.getMetadata(
            "__guards__",
            TestReleasesController,
        ) as { name: string }[];
        expect(guards.map((g) => g.name)).toEqual([
            "BetterAuthGuard",
            "OrganizationGuard",
            "ModuleEnforcementGuard",
        ]);
        expect(
            Reflect.getMetadata(REQUIRE_MODULE_KEY, TestReleasesController),
        ).toBe("WEBSITE");
        expect(Reflect.getMetadata(PATH_METADATA, TestReleasesController)).toBe(
            "organizations/:organizationId/sites/:siteId/test-releases",
        );
    });
});
