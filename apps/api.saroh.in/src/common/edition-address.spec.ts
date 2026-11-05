import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContextService } from "../modules/organizations/organization-context.service";
import { assertEditionMatchesAddress } from "./edition-address";
import { OrganizationGuard } from "./guards/organization.guard";

process.env.GLOBAL_DEV_DOMAIN = "global-dev.example";

describe("assertEditionMatchesAddress", () => {
    it("lets a business through its own edition's address", () => {
        expect(() =>
            assertEditionMatchesAddress("INDIA", "api.saroh.in"),
        ).not.toThrow();
        expect(() =>
            assertEditionMatchesAddress("GLOBAL", "api.saroh.tech"),
        ).not.toThrow();
        expect(() =>
            assertEditionMatchesAddress("GLOBAL", "api.global-dev.example"),
        ).not.toThrow();
    });

    it("refuses a business on the other edition's address", () => {
        expect(() =>
            assertEditionMatchesAddress("INDIA", "api.saroh.tech"),
        ).toThrow(ForbiddenException);
        expect(() =>
            assertEditionMatchesAddress("GLOBAL", "api.saroh.in"),
        ).toThrow(ForbiddenException);
    });

    it("has no say on an address that belongs to neither", () => {
        for (const host of [
            "localhost:3333",
            "api.saroh.localhost",
            "api.saroh.app",
        ]) {
            expect(() =>
                assertEditionMatchesAddress("GLOBAL", host),
            ).not.toThrow();
        }
    });

    it("has no say without an edition or a host", () => {
        expect(() =>
            assertEditionMatchesAddress(undefined, "api.saroh.in"),
        ).not.toThrow();
        expect(() =>
            assertEditionMatchesAddress("GLOBAL", undefined),
        ).not.toThrow();
    });
});

// The real guard, so a call or import lost from it fails here.
describe("OrganizationGuard", () => {
    const run = (edition: "INDIA" | "GLOBAL", host: string) => {
        const organizations = {
            resolve: jest
                .fn()
                .mockResolvedValue({ organizationId: "org_1", edition }),
        } as unknown as OrganizationContextService;
        const request = {
            method: "GET",
            user: { id: "user_1" },
            params: { organizationId: "org_1" },
            headers: { host },
        };
        return new OrganizationGuard(organizations).canActivate({
            switchToHttp: () => ({ getRequest: () => request }),
            getHandler: () => undefined,
            getClass: () => undefined,
        } as never);
    };

    it("passes a business on its own edition's address", async () => {
        await expect(run("GLOBAL", "api.saroh.tech")).resolves.toBe(true);
    });

    it("refuses a business on the other edition's address", async () => {
        await expect(run("GLOBAL", "api.saroh.in")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});
