jest.mock("@saroh/database", () => ({ prisma: {} }));

import { HttpException } from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { signSiteRelay } from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import { WaitlistController } from "./waitlist.controller";
import type { WaitlistService } from "./waitlist.service";

const DTO = {
    email: "founder@example.test",
    business: "Glow Studio",
    kind: "salon" as const,
};

function build() {
    const join = jest.fn().mockResolvedValue({
        created: true,
        position: 7,
        refCode: "abcdefgh",
    });
    const controller = new WaitlistController({
        join,
    } as unknown as WaitlistService);
    return { controller, join };
}

const relayFor = (address: string) =>
    signSiteRelay({ address, host: "www.saroh.in" }, siteRelaySecret());

describe("WaitlistController", () => {
    it("answers a new entry with its place and referral id", async () => {
        const { controller } = build();

        await expect(
            controller.join(DTO, "203.0.113.5", undefined),
        ).resolves.toEqual({
            ok: true,
            created: true,
            position: 7,
            ref: "abcdefgh",
        });
    });

    it("answers a repeat with neither", async () => {
        const { controller, join } = build();
        join.mockResolvedValue({ created: false });

        await expect(
            controller.join(DTO, "203.0.113.5", undefined),
        ).resolves.toEqual({ ok: true, created: false });
    });

    it("counts the visitor saroh.in's server signed, not the server", async () => {
        const { controller, join } = build();

        await controller.join(DTO, "10.0.0.1", relayFor("198.51.100.7"));

        expect(join).toHaveBeenCalledWith(
            expect.objectContaining({ ipHash: hashClientIp("198.51.100.7") }),
        );
    });

    it("counts the caller when the relay is forged, so forging buys nothing", async () => {
        const { controller, join } = build();
        const forged = signSiteRelay(
            { address: "198.51.100.7", host: "www.saroh.in" },
            "not-the-secret-not-the-secret-not-the-secret",
        );

        await controller.join(DTO, "203.0.113.5", forged);

        expect(join).toHaveBeenCalledWith(
            expect.objectContaining({ ipHash: hashClientIp("203.0.113.5") }),
        );
    });

    it("limits one visitor to five joins a minute, whatever server relays them", async () => {
        const { controller } = build();
        for (let i = 0; i < 5; i += 1) {
            await controller.join(DTO, `10.0.0.${i}`, relayFor("198.51.100.9"));
        }

        await expect(
            controller.join(DTO, "10.0.0.99", relayFor("198.51.100.9")),
        ).rejects.toBeInstanceOf(HttpException);
        // Someone else is not held back by them.
        await expect(
            controller.join(DTO, "10.0.0.99", relayFor("198.51.100.10")),
        ).resolves.toMatchObject({ ok: true });
    });
});
