jest.mock("@saroh/database", () => ({ prisma: {} }));

import { HttpException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { ChallengeVerifier } from "../site-accounts/challenge";
import type { SiteRelay } from "../site-accounts/site-relay";
import { SiteRelayGuard } from "../site-accounts/site-relay";
import { DownloadGateController } from "./download-gate.controller";
import type { DownloadGateService } from "./download-gate.service";
import { downloadContact, downloadEmail } from "./download-gate.service";
import { DOWNLOAD_NAMES, DOWNLOADS_URL } from "./download-names";
import { DownloadUnlockDto } from "./dto";

/**
 * The free downloads' gate (plan 2026-10-31-002 U9), without a database:
 * the route needs the signed relay; an email or an Indian mobile, exactly
 * one; and every refusal (limits, unknown download, contact, Turnstile)
 * comes before the gate writes anything. The rows are in
 * `download-gate.db.spec.ts`.
 */

const SLUG = "customer-list-template";
const relay = (address = "203.0.113.9"): SiteRelay => ({
    host: "www.saroh.in",
    address,
    clientHash: `hash-${address}`,
});

const unlock = jest.fn();
const challenge = {
    configured: true,
    siteKey: "site-key",
    verify: jest.fn(),
};
const controller = () =>
    new DownloadGateController(
        { unlock } as unknown as DownloadGateService,
        challenge as unknown as ChallengeVerifier,
    );
const body = (b: Record<string, unknown>) =>
    plainToInstance(DownloadUnlockDto, { slug: SLUG, ...b });
const status = async (p: Promise<unknown>) => {
    try {
        await p;
        return 200;
    } catch (e) {
        return (e as HttpException).getStatus();
    }
};

beforeEach(() => {
    unlock.mockReset().mockResolvedValue({ unlocked: true, emailed: "none" });
    challenge.configured = true;
    challenge.verify.mockReset().mockResolvedValue(true);
});

describe("the route", () => {
    it("is guarded by the relay: only saroh.in's server may call it", () => {
        expect(
            Reflect.getMetadata(GUARDS_METADATA, DownloadGateController),
        ).toContain(SiteRelayGuard);
    });

    it("tells the page the Turnstile key", () => {
        expect(controller().options()).toEqual({
            turnstileSiteKey: "site-key",
        });
    });

    it("takes a slug, an email or a phone and a token, nothing else", async () => {
        const dto = body({ email: " Owner@Example.com ", turnstileToken: "t" });
        expect(await validate(dto)).toEqual([]);
        expect(dto.email).toBe("owner@example.com");
        expect(await validate(body({ email: "owner@" }))).not.toEqual([]);
    });
});

describe("the contact", () => {
    it("is an email or a phone, never both or neither", () => {
        for (const both of [
            { email: "a@example.com", phone: "9845012345" },
            {},
            { email: " ", phone: "" },
        ]) {
            expect(() => downloadContact(both)).toThrow(HttpException);
        }
    });

    it("reads an Indian mobile to +91 and keys it by the number", () => {
        expect(downloadContact({ phone: "98450 12345" })).toEqual({
            email: null,
            phone: "+919845012345",
            key: "+919845012345",
        });
    });

    it.each(["12345", "+91 0845012345", "+1 415 555 0100", "040 2345 6789"])(
        "refuses %s: not an Indian mobile (DEC-198)",
        (phone) => {
            expect(() => downloadContact({ phone })).toThrow(HttpException);
        },
    );

    it("keys an email as the waitlist does", () => {
        expect(downloadContact({ email: "A.B+x@Gmail.com" })).toEqual({
            email: "a.b+x@gmail.com",
            phone: null,
            key: "ab@gmail.com",
        });
    });
});

describe("refusals come before anything is written", () => {
    it("an unknown download is 404, not a bad contact", async () => {
        expect(
            await status(
                controller().unlock(
                    body({ slug: "nope", email: "a@example.com" }),
                    relay(),
                ),
            ),
        ).toBe(404);
        expect(unlock).not.toHaveBeenCalled();
    });

    it("both or neither contact is 400", async () => {
        const c = controller();
        expect(await status(c.unlock(body({}), relay()))).toBe(400);
        expect(
            await status(
                c.unlock(
                    body({ email: "a@example.com", phone: "9845012345" }),
                    relay(),
                ),
            ),
        ).toBe(400);
        expect(unlock).not.toHaveBeenCalled();
    });

    it("a failed Turnstile is 403 challenge", async () => {
        challenge.verify.mockResolvedValue(false);
        const err = await controller()
            .unlock(body({ email: "a@example.com" }), relay())
            .catch((e: HttpException) => e);
        expect((err as HttpException).getStatus()).toBe(403);
        expect((err as HttpException).getResponse()).toMatchObject({
            details: { reason: "challenge" },
        });
        expect(challenge.verify).toHaveBeenCalledWith(undefined, "203.0.113.9");
        expect(unlock).not.toHaveBeenCalled();
    });

    it("with no Turnstile set up the gate stays open", async () => {
        challenge.configured = false;
        expect(
            await status(
                controller().unlock(body({ email: "a@example.com" }), relay()),
            ),
        ).toBe(200);
        expect(challenge.verify).not.toHaveBeenCalled();
    });

    it("the 6th request in a minute from one address is 429", async () => {
        const c = controller();
        for (let i = 0; i < 5; i += 1) {
            expect(
                await status(
                    c.unlock(body({ email: `p${i}@example.com` }), relay()),
                ),
            ).toBe(200);
        }
        expect(
            await status(c.unlock(body({ email: "p5@example.com" }), relay())),
        ).toBe(429);
        expect(unlock).toHaveBeenCalledTimes(5);
    });

    it("the 6th request in a minute for one contact is 429, from any address", async () => {
        const c = controller();
        for (let i = 0; i < 5; i += 1) {
            await c.unlock(
                body({ phone: "9845012345" }),
                relay(`198.51.100.${i}`),
            );
        }
        expect(
            await status(
                c.unlock(
                    body({ phone: "+91 98450 12345" }),
                    relay("192.0.2.1"),
                ),
            ),
        ).toBe(429);
        expect(unlock).toHaveBeenCalledTimes(5);
    });
});

describe("the email", () => {
    it("has our words, the download's name and its link, from our list", () => {
        const mail = downloadEmail(SLUG);
        expect(mail.subject).toBe(`${DOWNLOAD_NAMES[SLUG]}: your download`);
        expect(mail.text).toContain(`${DOWNLOADS_URL}/${SLUG}`);
        expect(mail.text).toContain("We won't send you anything else");
        expect(() => downloadEmail("nope")).toThrow();
    });
});
