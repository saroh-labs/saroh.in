/**
 * What Saroh's billing mail says about a business's own domain (DEC-139):
 * the line the plan's own notices carry, the domain's own email, who it is
 * sent to and when it says nothing. The database is a stub; every name and
 * domain is made up.
 */
const noticeFindUnique = jest.fn();
const noticeCreateMany = jest.fn();
const organizationFindUnique = jest.fn();
const membershipFindMany = jest.fn();
const roleFindMany = jest.fn();

jest.mock("@saroh/database", () => ({
    prisma: {
        customerNotice: {
            findUnique: (...a: unknown[]) => noticeFindUnique(...a) as unknown,
            createMany: (...a: unknown[]) => noticeCreateMany(...a) as unknown,
        },
        organization: {
            findUnique: (...a: unknown[]) =>
                organizationFindUnique(...a) as unknown,
        },
        membership: {
            findMany: (...a: unknown[]) => membershipFindMany(...a) as unknown,
        },
        organizationRole: {
            findMany: (...a: unknown[]) => roleFindMany(...a) as unknown,
        },
    },
}));
jest.mock("../../common/app-url", () => ({
    appBase: () => "https://app.example.test",
}));
jest.mock("./saroh-seller", () => ({
    sarohSeller: () => ({ email: "billing@example.test" }),
}));
jest.mock("./saroh-invoice-paper", () => ({
    renderSarohInvoicePdf: jest.fn(),
}));
jest.mock("./renewal-reminder", () => ({ composeRenewalReminder: jest.fn() }));
jest.mock("./term-ending", () => ({ termEndingOf: jest.fn() }));
jest.mock("./offers", () => ({ paidFirstMonth: jest.fn() }));
jest.mock("./domain-plan.service", () => ({ domainPlan: {} }));

import type { Job } from "@saroh/database";

import type { SarohBillingEmail } from "../../common/email";
import { parseBillingEmailPayload } from "./billing-email-payload";
import { BillingEmailHandler } from "./billing-email.job";
import {
    domainEmail,
    freeChosenEmail,
    freeChosenNotice,
    moveDownEmail,
    moveDownNotice,
    planEndingEmail,
    planEndingNotice,
    termEndingEmail,
    termEndingNotice,
} from "./billing-emails";
import type { DomainPlanState } from "./domain-plan";
import type { DomainPlanService } from "./domain-plan.service";

const DOMAIN = {
    hostnames: ["shop.example.com"],
    stopsOn: "18 Nov 2026",
    address: "yourshop.saroh.app",
};
const LINE =
    "shop.example.com stops showing your site on 18 Nov 2026, 3 days after your plan ends. After that, visitors are sent to yourshop.saroh.app.";
const URL = "https://app.example.test/settings/billing#change-plan";

describe("the plan's own notices carry the domain's line (DEC-139)", () => {
    it("a plan that ends on a date", () => {
        const input = {
            businessName: "Rye & Co.",
            planName: "Plan B",
            nextPlanName: "Plan A",
            endsOn: "15 Nov 2026",
        };
        expect(planEndingEmail({ ...input, domain: DOMAIN }).html).toContain(
            LINE,
        );
        expect(planEndingNotice({ ...input, domain: DOMAIN }).body).toContain(
            LINE,
        );
        // And nothing about a domain for a business without one.
        expect(planEndingEmail(input).html).not.toMatch(/domain/i);
        expect(planEndingNotice(input).body).not.toMatch(/domain/i);
    });

    it("a term that ends, asked to pay or chosen Free", () => {
        const input = {
            businessName: "Rye",
            planName: "Plan B",
            endsOn: "15 Nov 2026",
            payUrl: URL,
        };
        expect(
            termEndingEmail({
                ...input,
                payment: "AUTOPAY",
                price: null,
                domain: DOMAIN,
            }).html,
        ).toContain(LINE);
        expect(termEndingNotice({ ...input, domain: DOMAIN }).body).toContain(
            LINE,
        );
        expect(freeChosenEmail({ ...input, domain: DOMAIN }).html).toContain(
            LINE,
        );
        expect(freeChosenNotice({ ...input, domain: DOMAIN }).body).toContain(
            LINE,
        );
        expect(
            termEndingEmail({ ...input, payment: "AUTOPAY", price: null }).html,
        ).not.toMatch(/domain/i);
    });

    it("a move down: ahead it stops 3 days after the end; made now it shows until the day", () => {
        const w = {
            businessName: "Rye",
            planName: "Plan B",
            nextPlanName: "Plan A",
            movesOn: "15 Nov 2026",
            pausesOn: "22 Nov 2026",
            lines: ["Asha is paused."],
            url: URL,
        };
        expect(
            moveDownEmail({ ...w, mode: "scheduled", domain: DOMAIN }).html,
        ).toContain(LINE);
        const now = moveDownEmail({ ...w, mode: "now", domain: DOMAIN }).html;
        expect(now).toContain(
            "Your plan no longer includes your own domain. shop.example.com shows your site until 18 Nov 2026.",
        );
        expect(
            moveDownNotice({ ...w, mode: "now", domain: DOMAIN }).body,
        ).toContain("shows your site until 18 Nov 2026");
        expect(moveDownEmail({ ...w, mode: "now" }).html).not.toMatch(
            /domain/i,
        );
    });
});

describe("the domain's own email (DEC-139)", () => {
    const input = { businessName: "Rye & Co.", domain: DOMAIN, url: URL };

    it("ahead: the named day in the subject, the way back as the button", () => {
        const email = domainEmail({ ...input, mode: "ending" });
        expect(email.subject).toBe(
            "Rye & Co.'s domain stops showing its site on 18 Nov 2026",
        );
        expect(email.html).toContain(LINE);
        expect(email.html).toContain("Your domain stays connected.");
        expect(email.html).toContain(`href="${URL}"`);
        expect(email.html).toContain("Open Plan and billing");
    });

    it("once the plan has ended: the site still shows until the day", () => {
        const email = domainEmail({ ...input, mode: "ended" });
        expect(email.subject).toBe(
            "Rye & Co.'s domain stops showing its site on 18 Nov 2026",
        );
        expect(email.html).toContain(
            "shop.example.com shows your site until 18 Nov 2026",
        );
    });

    it("paused: what is true now, and where customers land", () => {
        const email = domainEmail({ ...input, mode: "paused" });
        expect(email.subject).toBe("Rye & Co.'s domain is paused");
        expect(email.html).toContain("Your domain is paused");
        expect(email.html).toContain("visitors are sent to yourshop.saroh.app");
        expect(email.html).toContain("with nothing to set up again");
    });

    it("escapes what a business typed, and names no price or plan", () => {
        const email = domainEmail({
            businessName: "<b>Rye</b>",
            mode: "paused",
            domain: DOMAIN,
            url: URL,
        });
        expect(email.html).not.toContain("<b>Rye</b>");
        expect(`${email.subject} ${email.html}`).not.toMatch(/₹|Plan [ABC]\b/);
    });
});

describe("the DOMAIN email's payload", () => {
    const good = {
        kind: "DOMAIN",
        organizationId: "org_1",
        eventKey: "domain-paused:2026-11-15T10:00:00.000Z",
        mode: "paused",
        ...DOMAIN,
    };

    it("reads a whole one, and refuses a malformed one", () => {
        expect(parseBillingEmailPayload(good)).toEqual(good);
        expect(
            parseBillingEmailPayload({ ...good, address: null }),
        ).not.toBeNull();
        expect(parseBillingEmailPayload({ ...good, mode: "later" })).toBeNull();
        expect(parseBillingEmailPayload({ ...good, hostnames: [] })).toBeNull();
        expect(
            parseBillingEmailPayload({ ...good, stopsOn: undefined }),
        ).toBeNull();
    });

    it("reads the line on a plan's own notice, and a malformed one as none", () => {
        const planEnding = {
            kind: "PLAN_ENDING",
            organizationId: "org_1",
            overrideId: "ov_1",
            endsAt: "2026-11-15T10:00:00.000Z",
            stage: 7,
            planName: "Plan B",
            nextPlanName: "Plan A",
            endsOn: "15 Nov 2026",
        };
        expect(
            parseBillingEmailPayload({ ...planEnding, domain: DOMAIN }),
        ).toMatchObject({ domain: DOMAIN });
        expect(
            parseBillingEmailPayload({ ...planEnding, domain: { x: 1 } }),
        ).toMatchObject({ domain: null });
    });
});

describe("sending the domain's own email (DEC-139)", () => {
    let sent: SarohBillingEmail[];
    let plan: DomainPlanState;
    const domains = {
        stateOf: jest.fn(async () => plan),
    } as unknown as DomainPlanService;

    const job = (mode: "ending" | "ended" | "paused") =>
        ({
            id: "job_1",
            payload: {
                kind: "DOMAIN",
                organizationId: "org_1",
                eventKey: `domain-test:${mode}`,
                mode,
                ...DOMAIN,
            },
        }) as unknown as Job;

    function handler() {
        return new BillingEmailHandler((email) => {
            sent.push(email);
            return Promise.resolve("sent");
        }, domains);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        sent = [];
        plan = { state: "paused", since: new Date() };
        noticeFindUnique.mockResolvedValue(null);
        noticeCreateMany.mockResolvedValue({ count: 1 });
        organizationFindUnique.mockResolvedValue({ name: "Rye" });
        roleFindMany.mockResolvedValue([]);
        membershipFindMany.mockResolvedValue([
            {
                role: "OWNER",
                extraActions: [],
                user: { email: "owner@example.com" },
            },
            {
                role: "ADMIN",
                extraActions: [],
                user: { email: "admin@example.com" },
            },
        ]);
    });

    it("goes to the business's owners only, once", async () => {
        await handler().handle(job("paused"));
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toEqual(["owner@example.com"]);
        expect(sent[0].subject).toBe("Rye's domain is paused");
        // Scoped to the business the job names.
        expect(membershipFindMany.mock.calls[0][0]).toMatchObject({
            where: { organizationId: "org_1" },
        });
        expect(noticeCreateMany.mock.calls[0][0]).toMatchObject({
            data: [
                {
                    organizationId: "org_1",
                    eventKey: "saroh-billing:domain-test:paused",
                },
            ],
        });
        // Claimed: a retry says nothing.
        noticeFindUnique.mockResolvedValue({ id: "c1" });
        await handler().handle(job("paused"));
        expect(sent).toHaveLength(1);
    });

    it("says nothing once the business is back on a plan with a domain", async () => {
        plan = { state: "included" };
        for (const mode of ["ending", "ended", "paused"] as const) {
            await handler().handle(job(mode));
        }
        expect(sent).toEqual([]);
        expect(noticeCreateMany).not.toHaveBeenCalled();
    });

    it("sends each notice only while the domain stands where it says", async () => {
        plan = {
            state: "ending",
            endsAt: new Date(),
            stopsAt: new Date(),
        };
        await handler().handle(job("paused"));
        await handler().handle(job("ended"));
        expect(sent).toEqual([]);
        await handler().handle(job("ending"));
        expect(sent).toHaveLength(1);

        plan = { state: "grace", endedAt: new Date(), stopsAt: new Date() };
        await handler().handle(job("ended"));
        expect(sent).toHaveLength(2);
    });
});
