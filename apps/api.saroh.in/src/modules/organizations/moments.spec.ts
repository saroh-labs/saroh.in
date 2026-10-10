import { BadRequestException, ForbiddenException } from "@nestjs/common";

// A mocked Prisma: the service never touches a real Postgres here.
jest.mock("@saroh/database", () => ({
    prisma: {
        organization: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { isMomentKey, MOMENT_KEYS, seenMoments } from "./moments";
import { MomentsService } from "./moments.service";

const findUnique = prisma.organization.findUnique as jest.Mock;
const update = prisma.organization.update as jest.Mock;

const ctx = (role: OrgRole = "OWNER") => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

const service = new MomentsService();

beforeEach(() => {
    findUnique.mockReset();
    update.mockReset().mockResolvedValue({});
});

describe("seenMoments", () => {
    it("keeps the known keys that carry a time", () => {
        expect(
            seenMoments({
                "first-order": "2026-10-10T09:14:00.000Z",
                "first-booking": "not a time",
                "something-else": "2026-10-10T09:14:00.000Z",
            }),
        ).toEqual({ "first-order": "2026-10-10T09:14:00.000Z" });
    });

    it("reads anything that is not an object as nothing seen", () => {
        for (const stored of [null, undefined, "x", 3, ["first-order"]]) {
            expect(seenMoments(stored)).toEqual({});
        }
    });

    it("knows its own keys and no others", () => {
        for (const key of MOMENT_KEYS) expect(isMomentKey(key)).toBe(true);
        expect(isMomentKey("first-refund")).toBe(false);
        expect(isMomentKey(undefined)).toBe(false);
    });
});

describe("MomentsService", () => {
    it("reads the moments the business has seen", async () => {
        findUnique.mockResolvedValue({
            momentsSeen: { "first-order": "2026-10-10T09:14:00.000Z" },
        });
        await expect(service.read(ctx("MEMBER"))).resolves.toEqual({
            seen: ["first-order"],
        });
        expect(findUnique).toHaveBeenCalledWith({
            where: { id: "org_1" },
            select: { momentsSeen: true },
        });
    });

    it("reads a business that has seen none", async () => {
        findUnique.mockResolvedValue({ momentsSeen: {} });
        await expect(service.read(ctx())).resolves.toEqual({ seen: [] });
    });

    it("marks a moment seen for the business, beside what it had", async () => {
        findUnique.mockResolvedValue({
            momentsSeen: { "first-order": "2026-10-01T00:00:00.000Z" },
        });
        const res = await service.markSeen(ctx("MEMBER"), "first-booking");
        expect(res.seen).toEqual(["first-order", "first-booking"]);
        const { where, data } = update.mock.calls[0][0];
        expect(where).toEqual({ id: "org_1" });
        expect(data.momentsSeen["first-order"]).toBe(
            "2026-10-01T00:00:00.000Z",
        );
        expect(Date.parse(data.momentsSeen["first-booking"])).not.toBeNaN();
    });

    it("keeps the first time when it is marked twice", async () => {
        findUnique.mockResolvedValue({
            momentsSeen: { "first-order": "2026-10-01T00:00:00.000Z" },
        });
        await expect(service.markSeen(ctx(), "first-order")).resolves.toEqual({
            seen: ["first-order"],
        });
        expect(update).not.toHaveBeenCalled();
    });

    it("refuses a key that is not on the list, and writes nothing", async () => {
        await expect(
            service.markSeen(ctx(), "first-refund"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(findUnique).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("is closed to a Reviewer, who is shown nothing about the business", async () => {
        await expect(service.read(ctx("REVIEWER"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.markSeen(ctx("REVIEWER"), "first-order"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(update).not.toHaveBeenCalled();
    });
});
