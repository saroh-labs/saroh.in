jest.mock("@saroh/database", () => ({ prisma: {} }));

import { Logger } from "@nestjs/common";

import type { SiteRelay } from "../site-accounts/site-relay";
import type { QrMakerGateService } from "./qr-maker-gate.service";
import { QrMakerController } from "./qr-maker.controller";

let visitor = 0;
const relay = (): SiteRelay => ({
    host: "www.saroh.in",
    address: `203.0.113.${(visitor += 1)}`,
    clientHash: `hash-${visitor}`,
});

describe("QrMakerController: the edition an unlock files under (KTD11)", () => {
    it("is the address's edition, and India with a WARN for an address of none", async () => {
        const unlock = jest.fn().mockResolvedValue({ unlocked: true });
        const controller = new QrMakerController({
            unlock,
        } as unknown as QrMakerGateService);
        const warn = jest
            .spyOn(Logger.prototype, "warn")
            .mockImplementation(() => undefined);
        const dto = { email: "a@example.com" };

        await controller.unlock(dto, relay(), "api.saroh.tech");
        expect(unlock).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "GLOBAL" }),
        );
        await controller.unlock(dto, relay(), "api.saroh.in");
        expect(unlock).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "INDIA" }),
        );
        expect(warn).not.toHaveBeenCalled();
        await controller.unlock(dto, relay(), undefined);
        expect(unlock).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "INDIA" }),
        );
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("form_host_of_no_edition"),
        );
        warn.mockRestore();
    });
});
