// The scan route's guards, read from the controller itself: it answers only
// the site's own server (the signed relay), never a caller of the API, and
// goes offline with a deleted business's site.
jest.mock("@saroh/database", () => ({
    prisma: {},
    runInOrgContext: jest.fn(),
}));

import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import { SiteRelayGuard } from "../site-accounts/site-relay";
import { PublicQrController } from "./public-qr.controller";
import type { PublicQrService } from "./public-qr.service";

describe("PublicQrController", () => {
    it("sits under the site, behind the lifecycle guard and the signed relay", () => {
        expect(Reflect.getMetadata(PATH_METADATA, PublicQrController)).toBe(
            "public/sites/:siteId/qr",
        );
        expect(
            Reflect.getMetadata(GUARDS_METADATA, PublicQrController),
        ).toEqual([PublicSiteOnlineGuard, SiteRelayGuard]);
    });

    it("refuses a call with no relay, before anything is read or counted", () => {
        const guard = new SiteRelayGuard();
        const context = {
            switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
        };
        expect(() => guard.canActivate(context as never)).toThrow();
    });

    it("counts the visitor the relay names, never one the caller sent", async () => {
        const scan = jest.fn().mockResolvedValue({ kind: "home" });
        const controller = new PublicQrController({
            scan,
        } as unknown as PublicQrService);
        await controller.scan(
            "site_1",
            "h7c",
            { host: "rye.saroh.app", address: "203.0.113.7", clientHash: "h" },
            { userAgent: "Phone", head: true },
        );
        expect(scan).toHaveBeenCalledWith("site_1", "h7c", "h", {
            userAgent: "Phone",
            head: true,
        });
    });
});
