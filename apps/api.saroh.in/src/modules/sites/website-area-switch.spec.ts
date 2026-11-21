import "reflect-metadata";

// The controllers' guards and auth: only route metadata is read.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("../../common/auth/auth", () => ({ auth: { api: {} } }));
jest.mock("@saroh/auth", () => ({ getTrustedOrigins: () => [] }));

import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { env } from "../../env";
import { PostsController } from "../content/posts.controller";
import { ChangeRevertController } from "./change-revert.controller";
import { PageResultsController } from "./page-results.controller";
import { ServiceUsesController } from "./service-uses.controller";
import { SiteOverviewController } from "./site-overview.controller";
import { SiteRedirectsController } from "./site-redirects.controller";
import { SitesController } from "./sites.controller";
import { VersionRestoreController } from "./version-restore.controller";
import { WebsiteAreaSwitchGuard } from "./website-area-switch";
import { WebsiteAreaController } from "./website-area.controller";

/**
 * The Website area is one api-held switch (DEC-240): every route the area
 * added is a 404 with it off, and the app reads the switch from here.
 */
describe("the Website area switch (DEC-240)", () => {
    const original = env.WEBSITE_AREA;
    afterEach(() => {
        env.WEBSITE_AREA = original;
    });

    const guardsOf = (target: object): unknown[] =>
        (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[]) ?? [];

    it("guards every controller the area added", () => {
        for (const controller of [
            ChangeRevertController,
            PageResultsController,
            ServiceUsesController,
            SiteOverviewController,
            SiteRedirectsController,
            VersionRestoreController,
        ]) {
            expect(guardsOf(controller)).toContain(WebsiteAreaSwitchGuard);
        }
    });

    it("guards the area's routes on the sites and posts controllers", () => {
        const routes: [object, string[]][] = [
            [
                SitesController.prototype,
                ["changes", "approveChanges", "askForChanges", "duplicatePage"],
            ],
            [
                PostsController.prototype,
                [
                    "schedule",
                    "unschedule",
                    "requestApproval",
                    "approve",
                    "askForChanges",
                    "checks",
                    "listRevisions",
                    "getRevision",
                    "restoreRevision",
                ],
            ],
        ];
        for (const [proto, names] of routes) {
            for (const name of names) {
                const method = (proto as Record<string, object>)[name];
                expect([name, guardsOf(method)]).toEqual([
                    name,
                    [WebsiteAreaSwitchGuard],
                ]);
            }
        }
    });

    it("leaves today's routes alone", () => {
        for (const name of ["publish", "get"]) {
            const method = (
                SitesController.prototype as unknown as Record<string, object>
            )[name];
            expect(guardsOf(method)).toEqual([]);
        }
    });

    it("404s with the switch off and answers with it on", () => {
        env.WEBSITE_AREA = "off";
        expect(() => new WebsiteAreaSwitchGuard().canActivate()).toThrow(
            NotFoundException,
        );
        env.WEBSITE_AREA = "on";
        expect(new WebsiteAreaSwitchGuard().canActivate()).toBe(true);
    });

    it("tells the app the switch it holds", () => {
        env.WEBSITE_AREA = "on";
        expect(new WebsiteAreaController().read()).toEqual({ on: true });
        env.WEBSITE_AREA = "off";
        expect(new WebsiteAreaController().read()).toEqual({ on: false });
    });
});
