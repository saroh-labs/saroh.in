// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres, and
// the CommunicationsService is a fake so nothing sends.
jest.mock("@saroh/database", () => ({
    prisma: {
        lead: { findUnique: jest.fn() },
        automationRule: { findMany: jest.fn() },
        automationRun: { create: jest.fn(), update: jest.fn() },
        activity: { create: jest.fn() },
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { CommunicationsService } from "../communications/communications.service";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import {
    AUTOMATION_RUN_TYPE,
    AutomationRunHandler,
} from "./automation-run.handler";

const leadFindUnique = prisma.lead.findUnique as jest.Mock;
const ruleFindMany = prisma.automationRule.findMany as jest.Mock;
const runCreate = prisma.automationRun.create as jest.Mock;
const runUpdate = prisma.automationRun.update as jest.Mock;
const activityCreate = prisma.activity.create as jest.Mock;

/** A P2002 unique-violation error like the Prisma client raises. */
function p2002(): Error & { code: string } {
    return Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
    });
}

/** A claimed automation.run job carrying just the leadId. */
function job(leadId = "lead_1"): Job {
    return {
        id: "job_1",
        type: AUTOMATION_RUN_TYPE,
        payload: { leadId },
    } as unknown as Job;
}

const lead = {
    id: "lead_1",
    organizationId: "org_1",
    contactId: "contact_1",
};

/** A send.message rule. */
function sendRule(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "rule_send",
        organizationId: "org_1",
        name: "Welcome email",
        trigger: "lead.created",
        action: "send.message",
        config: { channel: "EMAIL", subject: "Hi", body: "Thanks!" },
        enabled: true,
        ...over,
    };
}

/** A create.task rule. */
function taskRule(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "rule_task",
        organizationId: "org_1",
        name: "Follow up",
        trigger: "lead.created",
        action: "create.task",
        config: { body: "Call the lead", dueInDays: 2 },
        enabled: true,
        ...over,
    };
}

describe("AutomationRunHandler", () => {
    let comms: { sendMessageAsSystem: jest.Mock };
    let handler: AutomationRunHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        leadFindUnique.mockResolvedValue(lead);
        runCreate.mockImplementation(({ data }) =>
            Promise.resolve({ id: `run_${data.ruleId}`, ...data }),
        );
        runUpdate.mockResolvedValue({});
        activityCreate.mockResolvedValue({ id: "act_1" });
        comms = { sendMessageAsSystem: jest.fn().mockResolvedValue({}) };
        handler = new AutomationRunHandler(
            comms as unknown as CommunicationsService,
        );
    });

    it("fires each enabled lead.created rule once, claiming an AutomationRun per (rule, lead)", async () => {
        ruleFindMany.mockResolvedValue([sendRule(), taskRule()]);

        await handler.handle(job());

        // One claim per rule, both scoped to the lead + its org.
        expect(runCreate).toHaveBeenCalledTimes(2);
        expect(runCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            ruleId: "rule_send",
            leadId: "lead_1",
            status: "DONE",
        });
        expect(runCreate.mock.calls[1][0].data).toMatchObject({
            ruleId: "rule_task",
            leadId: "lead_1",
        });

        // send.message ran through the system send (consent-gated path), aimed
        // at the lead's contact and linked to the lead.
        expect(comms.sendMessageAsSystem).toHaveBeenCalledTimes(1);
        expect(comms.sendMessageAsSystem).toHaveBeenCalledWith("org_1", {
            channel: "EMAIL",
            contactId: "contact_1",
            leadId: "lead_1",
            subject: "Hi",
            body: "Thanks!",
        });

        // create.task logged a system-authored TASK on the lead's timeline.
        expect(activityCreate).toHaveBeenCalledTimes(1);
        expect(activityCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            leadId: "lead_1",
            type: "TASK",
            body: "Call the lead",
            actorUserId: null,
        });
        expect(activityCreate.mock.calls[0][0].data.dueAt).toBeInstanceOf(Date);

        // No run needed to be marked FAILED.
        expect(runUpdate).not.toHaveBeenCalled();
    });

    it("skips a rule whose claim hits P2002 — the once-per-(rule,lead) guarantee under at-least-once redelivery", async () => {
        ruleFindMany.mockResolvedValue([sendRule()]);
        runCreate.mockRejectedValueOnce(p2002());

        await expect(handler.handle(job())).resolves.toBeUndefined();

        // Claim attempted, rejected as a duplicate → the action never ran.
        expect(runCreate).toHaveBeenCalledTimes(1);
        expect(comms.sendMessageAsSystem).not.toHaveBeenCalled();
        expect(runUpdate).not.toHaveBeenCalled();
    });

    it("skips disabled rules (only enabled ones are queried, so a disabled rule never fires)", async () => {
        // The handler filters `enabled: true` in the query; assert it asks for
        // exactly that, and that an empty result fires nothing.
        ruleFindMany.mockResolvedValue([]);

        await handler.handle(job());

        expect(ruleFindMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                trigger: "lead.created",
                enabled: true,
            },
            orderBy: { createdAt: "asc" },
        });
        expect(runCreate).not.toHaveBeenCalled();
        expect(comms.sendMessageAsSystem).not.toHaveBeenCalled();
    });

    it("records a FAILED run (and does NOT rethrow) when an action throws, so one rule's failure never wedges the job", async () => {
        ruleFindMany.mockResolvedValue([sendRule(), taskRule()]);
        comms.sendMessageAsSystem.mockRejectedValueOnce(
            new Error("provider exploded"),
        );

        await expect(handler.handle(job())).resolves.toBeUndefined();

        // The failing send's run was marked FAILED with the captured error…
        expect(runUpdate).toHaveBeenCalledTimes(1);
        expect(runUpdate.mock.calls[0][0]).toMatchObject({
            where: { id: "run_rule_send" },
            data: { status: "FAILED", error: "provider exploded" },
        });
        // …and the SECOND rule still fired (the task was created).
        expect(activityCreate).toHaveBeenCalledTimes(1);
    });

    it("marks a run FAILED when a stored rule has an unsupported action", async () => {
        ruleFindMany.mockResolvedValue([
            sendRule({ id: "rule_x", action: "do.something.new" }),
        ]);

        await expect(handler.handle(job())).resolves.toBeUndefined();

        expect(runUpdate).toHaveBeenCalledTimes(1);
        expect(runUpdate.mock.calls[0][0].data.status).toBe("FAILED");
        expect(runUpdate.mock.calls[0][0].data.error).toContain(
            "Unsupported automation action",
        );
    });

    it("completes as a no-op when the lead no longer exists (never dead-letters a doomed job)", async () => {
        leadFindUnique.mockResolvedValue(null);

        await expect(handler.handle(job("gone"))).resolves.toBeUndefined();
        expect(ruleFindMany).not.toHaveBeenCalled();
        expect(runCreate).not.toHaveBeenCalled();
    });

    it("rethrows a non-P2002 claim error so the worker retries (never swallows real DB failures)", async () => {
        ruleFindMany.mockResolvedValue([sendRule()]);
        runCreate.mockRejectedValueOnce(
            Object.assign(new Error("db down"), { code: "P1001" }),
        );

        await expect(handler.handle(job())).rejects.toThrow("db down");
    });

    it("registers under the automation.run job type", () => {
        const registry = new JobHandlerRegistry();
        registry.register(AUTOMATION_RUN_TYPE, handler.handle);

        expect(registry.has("automation.run")).toBe(true);
        expect(registry.get("automation.run")).toBe(handler.handle);
    });
});
