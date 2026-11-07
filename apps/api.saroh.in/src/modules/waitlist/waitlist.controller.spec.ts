jest.mock("@saroh/database", () => ({ prisma: {} }));

import { HttpException, Logger } from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import type { ChallengeVerifier } from "../site-accounts/challenge";
import { signSiteRelay } from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import { WaitlistController } from "./waitlist.controller";
import type { WaitlistService } from "./waitlist.service";

const DTO = {
    email: "founder@example.test",
    business: "Glow Studio",
    kind: "salon" as const,
};

function build(
    challenge: { configured: boolean; verify?: jest.Mock } = {
        configured: false,
    },
) {
    const join = jest.fn().mockResolvedValue({
        created: true,
        position: 7,
        refCode: "abcdefgh",
    });
    const tellMeWhen = jest.fn().mockResolvedValue(undefined);
    const controller = new WaitlistController(
        { join, tellMeWhen } as unknown as WaitlistService,
        challenge as unknown as ChallengeVerifier,
    );
    return { controller, join, tellMeWhen };
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

    it("takes the edition from the address it was called on", async () => {
        const { controller, join } = build();
        const call = (host?: string) =>
            controller.join(DTO, "203.0.113.5", undefined, host);

        await call("api.saroh.tech");
        expect(join).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "GLOBAL" }),
        );
        await call("api.saroh.in");
        expect(join).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "INDIA" }),
        );
        // Local, or an address of no edition: India, with a WARN (KTD11).
        const warn = jest
            .spyOn(Logger.prototype, "warn")
            .mockImplementation(() => undefined);
        await call("localhost:3333");
        expect(join).toHaveBeenLastCalledWith(
            expect.objectContaining({ edition: "INDIA" }),
        );
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("form_host_of_no_edition"),
        );
        warn.mockRestore();
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

    describe("Tell me when (paid-plans, KTD8)", () => {
        const ASK = {
            email: "owner@example.test",
            source: "paid-plans",
            turnstileToken: "tok",
        };

        it("answers a new and a repeat address with the same body", async () => {
            const verify = jest.fn().mockResolvedValue(true);
            const { controller, tellMeWhen, join } = build({
                configured: true,
                verify,
            });

            const first = await controller.join(
                ASK,
                "203.0.113.5",
                undefined,
                "api.saroh.tech",
            );
            const again = await controller.join(
                ASK,
                "203.0.113.6",
                undefined,
                "api.saroh.tech",
            );

            expect(first).toEqual({ ok: true });
            expect(again).toEqual(first);
            expect(tellMeWhen).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: ASK.email,
                    edition: "GLOBAL",
                }),
            );
            expect(join).not.toHaveBeenCalled();
            expect(verify).toHaveBeenCalledWith("tok", "203.0.113.5");
        });

        it("refuses a post without a valid Turnstile token, writing nothing", async () => {
            const verify = jest.fn().mockResolvedValue(false);
            const { controller, tellMeWhen } = build({
                configured: true,
                verify,
            });

            await expect(
                controller.join(
                    { email: ASK.email, source: "paid-plans" },
                    "203.0.113.7",
                    undefined,
                    "api.saroh.tech",
                ),
            ).rejects.toMatchObject({ status: 403 });
            expect(tellMeWhen).not.toHaveBeenCalled();
        });

        it("still takes it while Turnstile isn't set up, and says so at ERROR", async () => {
            const error = jest
                .spyOn(Logger.prototype, "error")
                .mockImplementation(() => undefined);
            const { controller, tellMeWhen } = build();

            await expect(
                controller.join(
                    { email: ASK.email, source: "paid-plans" },
                    "203.0.113.8",
                    undefined,
                    "api.saroh.tech",
                ),
            ).resolves.toEqual({ ok: true });
            expect(tellMeWhen).toHaveBeenCalled();
            error.mockRestore();
        });
    });
});
