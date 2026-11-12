/**
 * Publish codes (plan 2026-11-10-001, U11), with a mocked Prisma: which
 * codes publish_site takes and which it refuses. The rows, RLS and the
 * tools end to end are in tools/site.tools.db.spec.ts.
 */
const findFirst = jest.fn();
const updateMany = jest.fn();
const create = jest.fn();
const deleteMany = jest.fn();
jest.mock("@saroh/database", () => ({
    prisma: { mcpPublishCode: { findFirst, updateMany, create, deleteMany } },
}));

import type { McpCall } from "./activity.service";
import {
    issuePublishCode,
    PUBLISH_CODE_TTL_MS,
    redeemPublishCode,
} from "./publish-codes";
import { ToolError } from "./tool-registry";

const call = {
    ctx: { organizationId: "org-1" },
    connection: { id: "conn-1" },
} as unknown as McpCall;
const t0 = new Date("2026-11-12T10:00:00Z");

/** Issues a code, and has the mocked table answer with its row. */
async function issued(over: Record<string, unknown> = {}) {
    const { code } = await issuePublishCode(call, "site-1", "fp-1", t0);
    const data = create.mock.calls.at(-1)[0].data;
    findFirst.mockResolvedValue({
        id: "row-1",
        siteId: data.siteId,
        connectionId: data.connectionId,
        draftFingerprint: data.draftFingerprint,
        expiresAt: data.expiresAt,
        usedAt: null,
        ...over,
    });
    return { code, data };
}

const refusal = (p: Promise<unknown>) =>
    p.then(
        () => "published",
        (e: unknown) => (e instanceof ToolError ? e.message : String(e)),
    );

describe("publish codes (U11)", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        updateMany.mockResolvedValue({ count: 1 });
    });

    it("stores only a digest, bound to the connection, site and draft, for 10 minutes", async () => {
        const { code, data } = await issued();
        expect(data).toMatchObject({
            organizationId: "org-1",
            siteId: "site-1",
            connectionId: "conn-1",
            draftFingerprint: "fp-1",
        });
        expect(data.codeDigest).not.toContain(code);
        expect(data.expiresAt.getTime() - t0.getTime()).toBe(
            PUBLISH_CODE_TTL_MS,
        );
    });

    it("takes the right code once, in this business only", async () => {
        const { code } = await issued();
        await expect(
            redeemPublishCode(call, "site-1", code, "fp-1", t0),
        ).resolves.toBeUndefined();
        expect(findFirst.mock.calls[0][0].where.organizationId).toBe("org-1");
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: "row-1", usedAt: null },
            data: { usedAt: t0 },
        });
    });

    it("refuses a code already taken, even by a call racing this one", async () => {
        const { code } = await issued();
        updateMany.mockResolvedValue({ count: 0 });
        expect(
            await refusal(redeemPublishCode(call, "site-1", code, "fp-1", t0)),
        ).toMatch(/already used/);
    });

    it("refuses a code after 10 minutes", async () => {
        const { code } = await issued();
        const late = new Date(t0.getTime() + PUBLISH_CODE_TTL_MS);
        expect(
            await refusal(
                redeemPublishCode(call, "site-1", code, "fp-1", late),
            ),
        ).toMatch(/expired/);
    });

    it("refuses another connection's or site's code without spending it", async () => {
        const { code } = await issued({ connectionId: "conn-2" });
        expect(
            await refusal(redeemPublishCode(call, "site-1", code, "fp-1", t0)),
        ).toMatch(/isn't one Saroh gave/);
        await issued();
        expect(
            await refusal(redeemPublishCode(call, "site-2", code, "fp-1", t0)),
        ).toMatch(/isn't one Saroh gave/);
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("refuses when the draft changed since the summary", async () => {
        const { code } = await issued();
        const error = await redeemPublishCode(
            call,
            "site-1",
            code,
            "fp-2",
            t0,
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ToolError);
        expect((error as ToolError).message).toBe(
            "The draft changed since you showed the person what goes live.",
        );
        expect((error as ToolError).nextStep).toMatch(/preview_publish/);
    });
});
