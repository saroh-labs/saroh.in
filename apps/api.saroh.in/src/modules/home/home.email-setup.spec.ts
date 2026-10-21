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
// Whether Saroh posts the business's updates to its customers' accounts.
const thread = (on: boolean) => () => Promise.resolve(on);
const both = { connect: true, plans: true };

const MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed, and your customers don't hear about them.";
const MISSED_ACCOUNT =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Customers with an account on your site see booking and order updates there.";

describe("no email provider on Home", () => {
    it("asks whoever can connect one to connect it, in plain words", async () => {
        const action = await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
            thread(false),
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
            thread(false),
        );
        expect(action).toMatchObject({
            code: NO_EMAIL_PLAN_CODE,
            href: "/settings/billing/plans",
            tag: "Paid plans",
        });
        const { needs } = flattenNeeds([action as HomeAction], "Asia/Kolkata");
        expect(needs[0]?.sub).toBe(
            `${MISSED} Connecting your own email comes with a paid plan.`,
        );
    });

    it("says customers see updates in their account only where they do (U5)", async () => {
        const action = await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
            thread(true),
        );
        const { needs } = flattenNeeds([action as HomeAction], "Asia/Kolkata");
        expect(needs[0]?.sub).toBe(MISSED_ACCOUNT);
        const off = await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
            thread(false),
        );
        expect(
            flattenNeeds([off as HomeAction], "Asia/Kolkata").needs[0]?.sub,
        ).not.toMatch(/account/);
    });

    it("is said only to who can act on it", async () => {
        expect(
            await noEmailProvider(
                db(null),
                "org_1",
                { connect: false, plans: true },
                room(true),
                thread(false),
            ),
        ).toBeNull();
        expect(
            await noEmailProvider(
                db(null),
                "org_1",
                { connect: true, plans: false },
                room(false),
                thread(false),
            ),
        ).toBeNull();
    });

    it("goes once a provider is connected", async () => {
        expect(
            await noEmailProvider(
                db("CONNECTED"),
                "org_1",
                both,
                room(true),
                thread(true),
            ),
        ).toBeNull();
    });

    it("sorts with what is blocked; on Free, with setting up", async () => {
        const connect = (await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(true),
            thread(false),
        )) as HomeAction;
        const plans = (await noEmailProvider(
            db(null),
            "org_1",
            both,
            room(false),
            thread(false),
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
