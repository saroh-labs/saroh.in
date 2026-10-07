// Whether a business can email its customers, and what it is asked to do
// about it (DEC-011 amended 2026-10-07, DEC-091). No database: the provider
// read is a stub and the plan's room is injected.
jest.mock("../../env", () => ({ env: {} }));

import type { Prisma } from "@saroh/database";

import { allows } from "../organizations/organization-policy";
import { CommunicationsService } from "./communications.service";
import {
    EMAIL_SETUP_MISSED,
    EMAIL_SETUP_PLAN,
    EMAIL_SETUP_TITLE,
    emailSetupAsk,
    readEmailSetup,
} from "./email-setup";

function db(status: string | null) {
    return {
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue(status === null ? null : { status }),
        },
    } as unknown as Pick<Prisma.TransactionClient, "communicationProvider">;
}

const room = (answer: boolean | Error) =>
    jest.fn(() =>
        answer instanceof Error
            ? Promise.reject(answer)
            : Promise.resolve(answer),
    );

describe("readEmailSetup", () => {
    it("a connected provider: nothing to ask, and the plan isn't read", async () => {
        const r = room(false);
        expect(await readEmailSetup(db("CONNECTED"), "org_1", r)).toEqual({
            connected: true,
            canConnect: null,
        });
        expect(r).not.toHaveBeenCalled();
    });

    it.each([null, "DISABLED"])(
        "none (%s): whether the plan has room to connect one",
        async (status) => {
            expect(
                await readEmailSetup(db(status), "org_1", room(true)),
            ).toEqual({ connected: false, canConnect: true });
            expect(
                await readEmailSetup(db(status), "org_1", room(false)),
            ).toEqual({ connected: false, canConnect: false });
        },
    );

    it("a plan that couldn't be read is never claimed either way", async () => {
        expect(
            await readEmailSetup(db(null), "org_1", room(new Error("down"))),
        ).toEqual({ connected: false, canConnect: null });
    });
});

describe("emailSetupAsk: only whoever can act is asked", () => {
    const all = { connect: true, plans: true };
    it("nothing once a provider is connected", () => {
        expect(
            emailSetupAsk({ connected: true, canConnect: null }, all),
        ).toBeNull();
    });

    it("connect, for comms:manage, where the plan has room or can't be read", () => {
        for (const canConnect of [true, null]) {
            const setup = { connected: false, canConnect };
            expect(emailSetupAsk(setup, all)).toBe("connect");
            expect(
                emailSetupAsk(setup, { connect: false, plans: true }),
            ).toBeNull();
        }
    });

    it("the plans, for billing:read, where the plan can't connect one (DEC-091)", () => {
        const setup = { connected: false, canConnect: false };
        expect(emailSetupAsk(setup, all)).toBe("plans");
        expect(
            emailSetupAsk(setup, { connect: true, plans: false }),
        ).toBeNull();
    });
});

describe("the words", () => {
    it("say what the customers miss, plainly, and that a paid plan brings it", () => {
        expect(EMAIL_SETUP_TITLE).toBe("Your customers get no emails from you");
        expect(EMAIL_SETUP_MISSED).toBe(
            "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.",
        );
        expect(EMAIL_SETUP_PLAN).toBe(
            "Connecting your own email comes with a paid plan.",
        );
    });
});

describe("GET comms-providers/email-setup", () => {
    const ctx = (actions: string[]) =>
        ({
            organizationId: "org_1",
            userId: "u_1",
            role: "MEMBER",
            roleKey: "custom",
            actions: new Set(actions),
        }) as never;

    it("is refused to someone who can neither connect one nor see the plans", async () => {
        const c = ctx(["invoice:read"]);
        expect(allows(c, "comms:manage")).toBe(false);
        await expect(new CommunicationsService().emailSetup(c)).rejects.toThrow(
            /comms:manage/,
        );
    });
});
