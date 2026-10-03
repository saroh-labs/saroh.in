import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    actionFiles,
    exportedActions,
    SITE_ROUTES,
    statementAfterFirst,
} from "./site-actions.scan";

/**
 * Every write on a merchant's site refuses on a test release (DEC-071, T6):
 * an order, a booking, a waitlist, a plan or a pack, a payment, a message,
 * a change to an account, and signing in. Each action checks `Origin`
 * first (`origin.test.ts`, the same list of actions) and `testMode()`
 * next, and answers `test-release` without calling the API. A new action
 * must say which it is: a write, held to this, or a read.
 */

let requestHeaders = new Headers();

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
        SITE_ACCOUNT_AREA: "on",
        NODE_ENV: "test",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(requestHeaders),
    // A signed-in customer, so no action stops for want of a session.
    cookies: () =>
        Promise.resolve({
            get: (name: string) =>
                name === "__Host-saroh_session"
                    ? { name, value: "session-token" }
                    : undefined,
            set: () => undefined,
        }),
}));
vi.mock("react", async (original) => ({
    ...(await original<object>()),
    cache: <T>(fn: T) => fn,
}));

import * as account from "../app/[domain]/account/actions";
import * as bookings from "../app/[domain]/account/bookings/actions";
import * as me from "../app/[domain]/account/me/actions";
import * as messages from "../app/[domain]/account/messages/actions";
import * as plan from "../app/[domain]/account/plan/actions";
import * as autopay from "../app/[domain]/autopay/actions";
import * as book from "../app/[domain]/book/actions";
import * as shop from "../app/[domain]/shop/actions";

/** Reads: they change nothing, so a test release may make them. */
const READS = new Set([
    "quoteBag",
    "checkoutStanding",
    "creditFor",
    "waitlistFor",
    "loadSignInOptions",
    "moveTimes",
    "visitTimes",
    "packPayment",
    "planJoinStanding",
    "readAutopay",
]);

const LINE = { listingId: "lst_1", variantId: null, quantity: 1 };
const AT = "2026-10-04T05:30:00.000Z";
const KEY = "key_1";

/** Every write, called with arguments it would accept. */
const WRITES: Record<string, () => Promise<unknown>> = {
    startCheckout: () =>
        shop.startCheckout({ lines: [LINE], fulfilment: "PICKUP", key: KEY }),
    bookSignedIn: () =>
        book.bookSignedIn({
            serviceId: "svc_1",
            startAt: AT,
            idempotencyKey: KEY,
            pay: "DESK",
        }),
    joinWaitlist: () => book.joinWaitlist({ serviceId: "svc_1", startAt: AT }),
    leaveWaitlist: () =>
        book.leaveWaitlist({ serviceId: "svc_1", startAt: AT }),
    requestSignInCode: () => account.requestSignInCode("asha@example.in"),
    verifySignInCode: () =>
        account.verifySignInCode("asha@example.in", "123456"),
    signOut: () => account.signOut(),
    signOutEverywhere: () => account.signOutEverywhere(),
    moveBooking: () => bookings.moveBooking("bkg_1", AT),
    cancelBooking: () => bookings.cancelBooking("bkg_1"),
    bookVisit: () => bookings.bookVisit("ord_1", AT),
    updateAccountDetails: () =>
        me.updateAccountDetails({ name: "Asha", phone: "" }),
    requestEmailChangeCode: () => me.requestEmailChangeCode("new@example.in"),
    confirmEmailChange: () => me.confirmEmailChange("new@example.in", "123456"),
    addHealthNote: () => me.addHealthNote("Sore knee"),
    sendMessage: () => messages.sendMessage("Hello"),
    pausePlan: () => plan.pausePlan("sub_1", 2),
    resumePlan: () => plan.resumePlan("sub_1"),
    cancelPlan: () => plan.cancelPlan("sub_1"),
    payPlanNow: () => plan.payPlanNow("sub_1"),
    buyPack: () => plan.buyPack("pack_1", KEY),
    joinPlan: () => plan.joinPlan("plan_1", KEY),
    startPlanAutopay: () => plan.startPlanAutopay("sub_1", "UPI", KEY),
    joinStartAutopay: () => plan.joinStartAutopay("sub_1", "UPI", KEY),
};

/** The session and signed-out writes that answer only `{ ok }`. */
const BARE = new Set(["signOut", "signOutEverywhere"]);

const MODULES: Record<string, Record<string, unknown>> = {
    "shop/actions.ts": shop,
    "book/actions.ts": book,
    "account/actions.ts": account,
    "account/bookings/actions.ts": bookings,
    "account/me/actions.ts": me,
    "account/messages/actions.ts": messages,
    "account/plan/actions.ts": plan,
    "autopay/actions.ts": autopay,
};

function onHost(host: string) {
    requestHeaders = new Headers({
        host,
        origin: `https://${host}`,
        "x-real-ip": "198.18.0.1",
    });
}

const fetchMock = vi.fn(() =>
    Promise.resolve(
        new Response(JSON.stringify({}), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    ),
);

beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the site's actions, sorted", () => {
    const found = actionFiles().flatMap((file) =>
        exportedActions(readFileSync(file, "utf8")).map(({ name }) => ({
            file: path.relative(SITE_ROUTES, file),
            name,
        })),
    );

    it("names every action as a read or a write", () => {
        const unsorted = found
            .filter(({ name }) => !READS.has(name) && !(name in WRITES))
            .map(({ file, name }) => `${file}: ${name}`);
        expect(unsorted).toEqual([]);
    });

    it("calls every module this test imports", () => {
        expect(Object.keys(MODULES).sort()).toEqual(
            Array.from(new Set(found.map(({ file }) => file))).sort(),
        );
    });

    it.each(
        found
            .filter(({ name }) => name in WRITES)
            .map(({ file, name }) => [`${file}: ${name}`, file, name]),
    )("%s checks testMode() right after Origin", (_label, file, name) => {
        const source = readFileSync(path.join(SITE_ROUTES, file), "utf8");
        const action = exportedActions(source).find((a) => a.name === name);
        expect(statementAfterFirst(action?.lines ?? [])).toContain(
            "await testMode()",
        );
    });
});

describe("on a test host", () => {
    beforeEach(() => onHost("test--northwind.saroh.app"));

    it.each(Object.keys(WRITES))(
        "%s refuses as a test release and sends nothing",
        async (name) => {
            const result = (await WRITES[name]()) as {
                ok: boolean;
                reason?: string;
            };
            expect(result.ok).toBe(false);
            if (!BARE.has(name)) expect(result.reason).toBe("test-release");
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("refuses on a custom domain's test host too", async () => {
        onHost("test.shop.kavidental.in");
        const result = await messages.sendMessage("Hello");
        expect(result).toMatchObject({ ok: false, reason: "test-release" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("on a live host", () => {
    beforeEach(() => onHost("northwind.saroh.app"));

    it("the same write goes to the API", async () => {
        await messages.sendMessage("Hello");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
