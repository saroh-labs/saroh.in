import { Test } from "@nestjs/testing";

import { SignInController } from "./sign-in.controller";
import { SiteAccountsModule } from "./site-accounts.module";

/** The module wires up as Nest will build it at boot (A2). */
describe("SiteAccountsModule", () => {
    it("resolves the sign-in controller and its dependencies", async () => {
        const module = await Test.createTestingModule({
            imports: [SiteAccountsModule],
        }).compile();
        expect(module.get(SignInController)).toBeInstanceOf(SignInController);
        await module.close();
    });
});
