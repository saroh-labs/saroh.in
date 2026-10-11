// Home's Needs you, for a business with no email provider of its own
// (DEC-011 amended 2026-10-07, DEC-091): who is asked, in what words, where
// the row sorts, and that it goes once a provider is connected.
jest.mock("../../env", () => ({ env: {} }));

import type { Prisma } from "@saroh/database";

import {
    NO_EMAIL_CODE,
    NO_EMAIL_PLAN_CODE,
    noEmailProvider,
} from "./home-email-setup";
import type { HomeAction } from "./home-model";
import { flattenNeeds } from "./home-needs";

function db(status: string | null) {
    return {
        communicationProvider: {
            findUnique: jest
                .fn()
                .mockResolvedValue(status === null ? null : { status }),
        },
    } as unknown as Pick<Prisma.TransactionClient, "communicationProvider">;
}
const room = (has: boolean) => () => Promise.resolve(has);
const both = { connect: true, plans: true };

const MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.";

describe("no email provider on Home", () => {
    it("asks whoever can connect one to connect it, in plain words", async () => {
        const action = await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
        );
        expect(action).toMatchObject({
            code: NO_EMAIL_CODE,
            title: "Your customers get no emails from you",
            href: "/settings/providers",
            tag: "To connect",
        });
        const { needs } = flattenNeeds([action as HomeAction], "Asia/Kolkata");
        expect(needs).toEqual([
            expect.objectContaining({
                code: NO_EMAIL_CODE,
                title: "Your customers get no emails from you",
                sub: MISSED,
                tag: "To connect",
                tone: "due",
                href: "/settings/providers",
            }),
        ]);
    });

    it("on a plan that can't connect one (Free, DEC-091), says a paid plan brings it and links the plans", async () => {
        const action = await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(false),
        );
        expect(action).toMatchObject({
            code: NO_EMAIL_PLAN_CODE,
            href: "/settings/billing#change-plan",
            tag: "Paid plans",
        });
        const { needs } = flattenNeeds([action as HomeAction], "Asia/Kolkata");
        expect(needs[0]?.sub).toBe(
            `${MISSED} Connecting your own email comes with a paid plan.`,
        );
    });

    it("is said only to who can act on it", async () => {
        expect(
            await noEmailProvider(
                db(null),
                "org_1",
                { connect: false, plans: true },
                room(true),
            ),
        ).toBeNull();
        expect(
            await noEmailProvider(
                db(null),
                "org_1",
                { connect: true, plans: false },
                room(false),
            ),
        ).toBeNull();
    });

    it("goes once a provider is connected", async () => {
        expect(
            await noEmailProvider(db("CONNECTED"), "org_1", both, room(true)),
        ).toBeNull();
    });

    it("sorts with what is blocked; on Free, with setting up", async () => {
        const connect = (await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
        )) as HomeAction;
        const plans = (await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(false),
        )) as HomeAction;
        const notLive: HomeAction = {
            code: "WEBSITE_NOT_LIVE",
            title: "Your website isn't live",
            href: "/sites",
            severity: "ATTENTION",
        };
        const setup: HomeAction = {
            code: "CRM_SETUP",
            title: "Add your first lead",
            href: "/settings/modules",
            severity: "SETUP",
        };
        const order = (actions: HomeAction[]) =>
            flattenNeeds(actions, "Asia/Kolkata").needs.map((n) => n.code);
        expect(order([setup, connect, notLive])).toEqual([
            "WEBSITE_NOT_LIVE",
            NO_EMAIL_CODE,
            "CRM_SETUP",
        ]);
        expect(order([setup, plans, notLive])).toEqual([
            "WEBSITE_NOT_LIVE",
            NO_EMAIL_PLAN_CODE,
            "CRM_SETUP",
        ]);
    });
});
