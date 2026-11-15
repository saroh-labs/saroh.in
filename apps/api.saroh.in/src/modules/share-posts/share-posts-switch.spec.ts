/**
 * The release switch (DEC-217): with SHARE_POSTS anything but "on", every
 * share route (public pictures, the signed-in booking card, own posts)
 * answers 404, checked before anything else.
 */
import "reflect-metadata";

jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("../../common/guards/public-site-online.guard", () => ({
    PublicSiteOnlineGuard: class {},
}));
jest.mock("./public-share.service", () => ({ PublicShareService: class {} }));
jest.mock("./share-posts.service", () => ({ SharePostsService: class {} }));

import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { env } from "../../env";
import { PublicShareController } from "./public-share.controller";
import { ShareCardsController } from "./share-cards.controller";
import { SharePostsSwitchGuard } from "./share-posts-switch";
import { SharePostsController } from "./share-posts.controller";

describe("SharePostsSwitchGuard (SHARE_POSTS)", () => {
    const original = env.SHARE_POSTS;
    afterEach(() => {
        env.SHARE_POSTS = original;
    });

    it.each([undefined, "off"] as const)("is a 404 when %s", (value) => {
        env.SHARE_POSTS = value;
        expect(() => new SharePostsSwitchGuard().canActivate()).toThrow(
            NotFoundException,
        );
    });

    it("lets the request on when on", () => {
        env.SHARE_POSTS = "on";
        expect(new SharePostsSwitchGuard().canActivate()).toBe(true);
    });

    it.each([
        PublicShareController,
        ShareCardsController,
        SharePostsController,
    ])("%p asks it first", (controller) => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            controller,
        ) as unknown[];
        expect(guards[0]).toBe(SharePostsSwitchGuard);
    });
});
