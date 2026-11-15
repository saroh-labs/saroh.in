import { personUsage } from "./ask-ai.service";

/**
 * Settings › Ask AI's "Who asked this month" rows (plan 2026-11-13-001
 * U11): every member, whether "Use Ask AI" reaches them by role or as
 * their own extra, and their count. Made-up people.
 */

const member = (
    userId: string,
    role: string,
    extraActions: string[] = [],
    name: string | null = userId,
) => ({
    userId,
    role,
    extraActions,
    user: { name, email: `${userId}@example.test` },
});

describe("personUsage", () => {
    const at = new Date("2031-11-12T10:00:00.000Z");
    const counts = [
        { userId: "asha", _count: { _all: 96 }, _max: { startedAt: at } },
        { userId: "dev", _count: { _all: 11 }, _max: { startedAt: at } },
    ];

    it("lists every member, with or without Ask AI, counts only", () => {
        const rows = personUsage(
            [
                member("asha", "OWNER"),
                member("dev", "MEMBER", ["ai:use"]),
                member("neha", "MEMBER"),
            ],
            [],
            counts,
        );
        expect(rows).toEqual([
            {
                userId: "asha",
                name: "asha",
                role: "Owner",
                givenAskAi: false,
                canUse: true,
                questions: 96,
                lastAskedAt: at.toISOString(),
            },
            {
                userId: "dev",
                name: "dev",
                role: "Member",
                givenAskAi: true,
                canUse: true,
                questions: 11,
                lastAskedAt: at.toISOString(),
            },
            {
                userId: "neha",
                name: "neha",
                role: "Member",
                givenAskAi: false,
                canUse: false,
                questions: 0,
                lastAskedAt: null,
            },
        ]);
    });

    it("names a business's own role, and reads its stored permissions", () => {
        const [desk, kitchen] = personUsage(
            [member("simran", "front-desk"), member("ravi", "kitchen")],
            [
                { key: "front-desk", label: "Front desk", actions: ["ai:use"] },
                { key: "kitchen", label: "Kitchen", actions: ["order:stage"] },
            ],
            [],
        );
        expect(desk).toMatchObject({
            role: "Front desk",
            canUse: true,
            givenAskAi: false,
        });
        expect(kitchen).toMatchObject({ role: "Kitchen", canUse: false });
    });

    it("falls back to the email when a person has no name", () => {
        const [row] = personUsage([member("x", "ADMIN", [], null)], [], []);
        expect(row?.name).toBe("x@example.test");
    });
});
