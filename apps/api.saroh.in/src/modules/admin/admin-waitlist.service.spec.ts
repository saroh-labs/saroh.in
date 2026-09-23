jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: { findMany: jest.fn(), updateMany: jest.fn() },
    },
}));
jest.mock("../../env", () => ({
    env: { ACCOUNTS_URL: "https://accounts.example.test/", NODE_ENV: "test" },
}));
jest.mock("../../common/email", () => ({
    sendWaitlistInvitationEmail: jest.fn(),
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendWaitlistInvitationEmail } from "../../common/email";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminWaitlistService } from "./admin-waitlist.service";

const find = prisma.waitlistSignup.findMany as jest.Mock;
const update = prisma.waitlistSignup.updateMany as jest.Mock;
const send = sendWaitlistInvitationEmail as jest.Mock;

const staff: PlatformAdminInfo = {
    userId: "support_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [],
    viaBootstrap: false,
};

function build() {
    const audit = { write: jest.fn() };
    return {
        service: new AdminWaitlistService(
            audit as unknown as AdminAuditService,
        ),
        audit,
    };
}

beforeEach(() => jest.clearAllMocks());

describe("AdminWaitlistService.invite", () => {
    it("claims each person before emailing, so nobody is invited twice", async () => {
        find.mockResolvedValue([
            { id: "w1", email: "a@example.test", invitedAt: null },
            { id: "w2", email: "b@example.test", invitedAt: new Date() },
        ]);
        update
            .mockResolvedValueOnce({ count: 1 }) // w1 claimed
            .mockResolvedValueOnce({ count: 0 }); // w2 already invited
        send.mockResolvedValue("sent");
        const { service, audit } = build();

        await expect(
            service.invite(staff, ["w1", "w2"], "First batch"),
        ).resolves.toEqual({
            sent: 1,
            alreadyInvited: 1,
            failed: 0,
            notFound: 0,
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(
            "a@example.test",
            "https://accounts.example.test/signup?email=a%40example.test",
        );
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "waitlist.invited",
                reason: "First batch",
            }),
        );
    });

    it("releases a person whose email did not leave, so they are still waiting", async () => {
        find.mockResolvedValue([
            { id: "w1", email: "a@example.test", invitedAt: null },
        ]);
        update.mockResolvedValue({ count: 1 });
        send.mockResolvedValue("failed");
        const { service } = build();

        await expect(
            service.invite(staff, ["w1"], "First batch"),
        ).resolves.toEqual(expect.objectContaining({ sent: 0, failed: 1 }));
        expect(update).toHaveBeenLastCalledWith({
            where: { id: "w1", invitedAt: expect.any(Date) },
            data: { invitedAt: null },
        });
    });

    it("refuses an empty batch or one without a reason", async () => {
        const { service } = build();
        await expect(
            service.invite(staff, [], "First batch"),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.invite(staff, ["w1"], "x")).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
