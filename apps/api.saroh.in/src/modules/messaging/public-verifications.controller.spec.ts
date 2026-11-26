jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import { HttpException, HttpStatus } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import type { SiteRelay } from "../site-accounts/site-relay";
import type { StartVerificationDto } from "./dto";
import {
    PublicVerificationsController,
    VERIFICATION_SEND_WINDOW_MS,
    VERIFICATION_SENDS_PER_VISITOR,
} from "./messaging.controller";
import type { VerificationSendService } from "./verification-send.service";
import type { VerificationService } from "./verification.service";

jest.mock("../site-accounts/site-host", () => ({
    resolveSiteHost: jest.fn(async (host: string) => ({
        siteId: `site_${host}`,
        organizationId: `org_${host}`,
        host,
    })),
}));
jest.mock("../organizations/organization-lifecycle.gate", () => ({
    assertOrganizationOpen: jest.fn(async () => undefined),
}));

const dto = {
    module: "BOOKING",
    phone: "+919800000000",
} as StartVerificationDto;

function relay(clientHash: string, host = "rye.saroh.app"): SiteRelay {
    return { clientHash, host } as SiteRelay;
}

function setup() {
    const sendCode = jest.fn(async () => ({
        verificationId: "ver_1",
        expiresAt: new Date(),
    }));
    const controller = new PublicVerificationsController(
        { sendCode } as unknown as VerificationSendService,
        {} as VerificationService,
        new FixedWindowRateLimiter(
            VERIFICATION_SENDS_PER_VISITOR,
            VERIFICATION_SEND_WINDOW_MS,
        ),
    );
    return { controller, sendCode };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
        await promise;
        return 201;
    } catch (error) {
        return error instanceof HttpException ? error.getStatus() : 500;
    }
}

describe("PublicVerificationsController.start: per-visitor limit", () => {
    it("answers 429 past the visitor's limit, and sends nothing for it", async () => {
        const { controller, sendCode } = setup();
        for (let i = 0; i < VERIFICATION_SENDS_PER_VISITOR; i++) {
            expect(await statusOf(controller.start(relay("v1"), dto))).toBe(
                201,
            );
        }
        const refused = controller.start(relay("v1"), dto);
        await expect(refused).rejects.toMatchObject({
            status: HttpStatus.TOO_MANY_REQUESTS,
            response: { details: { reason: "limit" } },
        });
        expect(sendCode).toHaveBeenCalledTimes(VERIFICATION_SENDS_PER_VISITOR);
    });

    it("leaves another visitor, and the same visitor on another business, alone", async () => {
        const { controller } = setup();
        for (let i = 0; i < VERIFICATION_SENDS_PER_VISITOR; i++) {
            await controller.start(relay("v1"), dto);
        }
        expect(await statusOf(controller.start(relay("v2"), dto))).toBe(201);
        expect(
            await statusOf(
                controller.start(relay("v1", "pulse.saroh.app"), dto),
            ),
        ).toBe(201);
    });

    it("counts an ask the send then refuses, as site sign-in's code asks do", async () => {
        const { controller, sendCode } = setup();
        sendCode.mockRejectedValue(
            new HttpException("not sent", HttpStatus.SERVICE_UNAVAILABLE),
        );
        for (let i = 0; i < VERIFICATION_SENDS_PER_VISITOR; i++) {
            expect(await statusOf(controller.start(relay("v1"), dto))).toBe(
                503,
            );
        }
        expect(await statusOf(controller.start(relay("v1"), dto))).toBe(429);
    });

    it("refuses a sign-in code before counting it", async () => {
        const { controller } = setup();
        const signIn = { ...dto, module: "ACCOUNT" } as StartVerificationDto;
        for (let i = 0; i < VERIFICATION_SENDS_PER_VISITOR + 1; i++) {
            expect(await statusOf(controller.start(relay("v1"), signIn))).toBe(
                400,
            );
        }
        expect(await statusOf(controller.start(relay("v1"), dto))).toBe(201);
    });
});
