import { Test } from "@nestjs/testing";

import { AccountHomeService } from "./account-home.service";
import { AccountUnlinkService } from "./account-unlink.service";
import { AccountController } from "./account.controller";
import { SignInController } from "./sign-in.controller";
import { SiteAccountsModule } from "./site-accounts.module";
import { UNLINK_MOVERS } from "./unlink-plan";

/** The module wires up as Nest will build it at boot (A2, A4). */
describe("SiteAccountsModule", () => {
    it("resolves the sign-in controller and its dependencies", async () => {
        const module = await Test.createTestingModule({
            imports: [SiteAccountsModule],
        }).compile();
        expect(module.get(SignInController)).toBeInstanceOf(SignInController);
        await module.close();
    });

    it("resolves the account area (A5), with health notes closed until C12", async () => {
        const module = await Test.createTestingModule({
            imports: [SiteAccountsModule],
        }).compile();
        expect(module.get(AccountController)).toBeInstanceOf(AccountController);
        const home = module.get(AccountHomeService);
        expect((home as unknown as { notesOpen: boolean }).notesOpen).toBe(
            false,
        );
        await module.close();
    });

    it("exports This isn't them with the real movers, not an empty injection", async () => {
        const module = await Test.createTestingModule({
            imports: [SiteAccountsModule],
        }).compile();
        const unlink = module.get(AccountUnlinkService);
        expect(unlink).toBeInstanceOf(AccountUnlinkService);
        expect((unlink as unknown as { movers: unknown }).movers).toBe(
            UNLINK_MOVERS,
        );
        await module.close();
    });
});
