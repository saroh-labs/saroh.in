// The `mandate.cancel` job (round-2 D20): what it reads from a job, when it
// asks again, and when it doesn't. The service is mocked; the real rows are
// in mandates.db.spec.ts.
jest.mock("@saroh/database", () => ({
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

import type { Job } from "@saroh/database";

import { MANDATE_CANCEL_TYPE, scopeOfJob } from "./mandate-cancel-job";
import { MandateCancelHandler } from "./mandate-cancel.handler";
import type { MandatesService } from "./mandates.service";

const settle = jest.fn();
const handler = new MandateCancelHandler({
    settle,
} as unknown as MandatesService);

function job(payload: unknown, organizationId: string | null = "org_1"): Job {
    return {
        id: "job_1",
        organizationId,
        type: MANDATE_CANCEL_TYPE,
        payload,
    } as unknown as Job;
}

beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ confirmed: 1, unsure: 0, refused: 0 });
});

describe("the mandate.cancel job", () => {
    it("settles a subscription's mandates", async () => {
        await handler.handle(job({ subscriptionId: "sub_1" }));
        expect(settle).toHaveBeenCalledWith({
            organizationId: "org_1",
            subscriptionId: "sub_1",
        });
    });

    it("settles a contact's mandates (a merge, a removal)", async () => {
        await handler.handle(job({ contactId: "c_1" }));
        expect(settle).toHaveBeenCalledWith({
            organizationId: "org_1",
            contactId: "c_1",
        });
    });

    it("throws while the provider hasn't answered, so the worker asks again", async () => {
        settle.mockResolvedValue({ confirmed: 0, unsure: 1, refused: 0 });
        await expect(
            handler.handle(job({ subscriptionId: "sub_1" })),
        ).rejects.toThrow("not answered");
    });

    it("doesn't retry a refusal, which would be refused again", async () => {
        settle.mockResolvedValue({ confirmed: 0, unsure: 0, refused: 1 });
        await expect(
            handler.handle(job({ subscriptionId: "sub_1" })),
        ).resolves.toBeUndefined();
    });

    it("does nothing for a job that names no scope, or no business", async () => {
        await handler.handle(job({}));
        await handler.handle(job({ subscriptionId: "" }));
        await handler.handle(job({ subscriptionId: "sub_1" }, null));
        await handler.handle(job(null));
        expect(settle).not.toHaveBeenCalled();
    });
});

describe("the job's payload", () => {
    it("carries ids only", () => {
        expect(scopeOfJob("org_1", { subscriptionId: "sub_1" })).toEqual({
            organizationId: "org_1",
            subscriptionId: "sub_1",
        });
        expect(scopeOfJob("org_1", { contactId: 7 })).toBeNull();
    });
});
