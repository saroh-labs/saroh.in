// #917: a live custom domain that stops working is told once per incident,
// and told again once when it works again — against a stand-in transaction.
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));
jest.mock("../../env", () => ({
    env: { APP_URL: "https://app.saroh.localhost" },
}));
jest.mock("../../common/email", () => ({
    sendTeamAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

import type { Prisma } from "@saroh/database";

import { HOSTING_WORDS } from "../domains/domain-hosting-sync";
import { alertEventOfType } from "./alert-preferences";
import {
    DOMAIN_BACK_NOTIFICATION_TYPE,
    DOMAIN_DOWN_NOTIFICATION_TYPE,
    domainAlertChange,
    domainProblemWords,
    queueDomainAlert,
} from "./domain-alerts";
import { tellTeam } from "./team-alert.handler";
import type { TeamAlertPayload } from "./team-alerts";
import { TEAM_ALERT_TYPE } from "./team-alerts";

const ORG = "org_1";
const AT = "2026-10-09T10:00:00.000Z";

const member = (userId: string, role: string) => ({
    userId,
    role,
    user: { email: `${userId}@example.com` },
});

interface DomainRow {
    id: string;
    hostname: string;
    siteId: string | null;
    status: string;
    hostingStatus: string | null;
    hostingError: string | null;
    site: { name: string } | null;
}

function makeTx(domain: DomainRow | null) {
    /** The claims written so far, newest last: the incident's ledger. */
    const claims: { eventKey: string }[] = [];
    return {
        claims,
        $executeRaw: jest.fn().mockResolvedValue(1),
        domain: { findFirst: jest.fn().mockResolvedValue(domain) },
        membership: {
            findMany: jest
                .fn()
                .mockResolvedValue([
                    member("u_owner", "OWNER"),
                    member("u_admin", "ADMIN"),
                ]),
        },
        organizationRole: { findMany: jest.fn().mockResolvedValue([]) },
        notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co" }),
        },
        customerNotice: {
            createMany: jest.fn(
                ({ data }: { data: { eventKey: string }[] }) => {
                    const key = data[0]!.eventKey;
                    if (claims.some((c) => c.eventKey === key)) {
                        return Promise.resolve({ count: 0 });
                    }
                    claims.push({ eventKey: key });
                    return Promise.resolve({ count: 1 });
                },
            ),
            update: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn(
                ({ where }: { where: { eventKey: { startsWith: string } } }) =>
                    Promise.resolve(
                        claims
                            .filter((c) =>
                                c.eventKey.startsWith(
                                    where.eventKey.startsWith,
                                ),
                            )
                            .at(-1) ?? null,
                    ),
            ),
        },
        notification: {
            create: jest.fn().mockResolvedValue({ id: "ntf_1" }),
        },
        job: { create: jest.fn().mockResolvedValue({}) },
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

function domain(over: Partial<DomainRow> = {}): DomainRow {
    return {
        id: "dom_1",
        hostname: "shop.ryeandco.in",
        siteId: "site_1",
        status: "VERIFIED",
        hostingStatus: "PENDING",
        hostingError: null,
        site: { name: "Rye & Co shop" },
        ...over,
    };
}

const down = (
    over: Partial<Extract<TeamAlertPayload, { event: "domain" }>> = {},
): TeamAlertPayload => ({
    event: "domain",
    domainId: "dom_1",
    change: "down",
    at: AT,
    ...over,
});

const back = (at = "2026-10-10T10:00:00.000Z"): TeamAlertPayload => ({
    event: "domain",
    domainId: "dom_1",
    change: "back",
    at,
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe("what a check changed", () => {
    it("is down when a live domain stops being live, back when it is live again", () => {
        expect(domainAlertChange("ACTIVE", "PENDING")).toBe("down");
        expect(domainAlertChange("ACTIVE", "FAILED")).toBe("down");
        expect(domainAlertChange("ACTIVE", "REGISTER_FAILED")).toBe("down");
        expect(domainAlertChange("FAILED", "ACTIVE")).toBe("back");
        expect(domainAlertChange("PENDING", "ACTIVE")).toBe("back");
        expect(domainAlertChange("ACTIVE", "ACTIVE")).toBeNull();
        expect(domainAlertChange("PENDING", "FAILED")).toBeNull();
    });

    it("words each problem in fixed words", () => {
        expect(domainProblemWords(domain({ hostingStatus: "PENDING" }))).toBe(
            "It doesn't point to Saroh any more. Check its CNAME record at your domain provider.",
        );
        expect(
            domainProblemWords(
                domain({
                    hostingStatus: "FAILED",
                    hostingError: HOSTING_WORDS.certificate,
                }),
            ),
        ).toMatch(/secure certificate/);
        expect(
            domainProblemWords(
                domain({
                    hostingStatus: "FAILED",
                    hostingError: HOSTING_WORDS.blocked,
                }),
            ),
        ).toMatch(/blocked it/);
        expect(
            domainProblemWords(domain({ hostingStatus: "REGISTER_FAILED" })),
        ).toMatch(/couldn't connect it/);
    });

    it("is told on the Your website row", () => {
        expect(alertEventOfType(DOMAIN_DOWN_NOTIFICATION_TYPE)).toBe("site");
        expect(alertEventOfType(DOMAIN_BACK_NOTIFICATION_TYPE)).toBe("site");
    });
});

describe("a live domain that stops working", () => {
    it("is told once: one inbox notice naming the domain, and an email from Saroh", async () => {
        const tx = makeTx(domain());

        const out = await tellTeam(asTx(tx), ORG, down());

        expect(out.told).toBe(true);
        // Serialised per domain before anything is read.
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(tx.customerNotice.createMany).toHaveBeenCalledWith({
            data: [
                {
                    organizationId: ORG,
                    eventKey: `team:domain:dom_1:down:${AT}`,
                    kind: "TEAM_TOLD",
                    orderId: null,
                },
            ],
            skipDuplicates: true,
        });
        expect(tx.notification.create).toHaveBeenCalledWith({
            data: {
                organizationId: ORG,
                type: DOMAIN_DOWN_NOTIFICATION_TYPE,
                title: "shop.ryeandco.in stopped working",
                body: "Visitors can't reach Rye & Co shop at shop.ryeandco.in. It doesn't point to Saroh any more. Check its CNAME record at your domain provider. You'll find it in the site's Settings, under Your own domain. We'll tell you when it works again.",
            },
            select: { id: true },
        });
        // The Website row emails by default: owners and admins publish.
        expect(out.emails.map((e) => e.userId)).toEqual(["u_owner", "u_admin"]);
        const mail = out.emails[0]!.mail;
        expect(mail).toMatchObject({
            subject:
                "Rye & Co: Your own domain for Rye & Co shop stopped working",
            heading: "Your own domain for Rye & Co shop stopped working",
            body: "Visitors can't reach your website at your own domain. It doesn't point to Saroh any more. Check its CNAME record at your domain provider. We'll tell you when it works again.",
            url: "https://app.saroh.localhost/sites/site_1/settings",
            cta: "Open site settings",
        });
        // Saroh's email never carries the domain (sender-name.ts).
        expect(JSON.stringify(mail)).not.toContain("ryeandco.in");
    });

    it("says nothing more while the problem lasts", async () => {
        const tx = makeTx(domain());
        await tellTeam(asTx(tx), ORG, down());

        // A later check that saw it go down again (a "Check now" racing
        // the run), under a different instant: still the same incident.
        const again = await tellTeam(
            asTx(tx),
            ORG,
            down({ at: "2026-10-09T10:05:00.000Z" }),
        );
        // The same job run twice.
        const twice = await tellTeam(asTx(tx), ORG, down());

        expect(again.told).toBe(false);
        expect(twice.told).toBe(false);
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });

    it("isn't told when it is live again before the alert runs", async () => {
        const tx = makeTx(domain({ hostingStatus: "ACTIVE" }));
        const out = await tellTeam(asTx(tx), ORG, down());
        expect(out.told).toBe(false);
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    it("isn't told for a domain removed since", async () => {
        const tx = makeTx(null);
        const out = await tellTeam(asTx(tx), ORG, down());
        expect(out.told).toBe(false);
    });

    it("doesn't email whoever pressed Check now; the bell still tells the rest", async () => {
        const tx = makeTx(domain());
        const out = await tellTeam(
            asTx(tx),
            ORG,
            down({ actorUserId: "u_owner" }),
        );
        expect(tx.notification.create).toHaveBeenCalledTimes(1);
        expect(out.emails.map((e) => e.userId)).toEqual(["u_admin"]);
    });

    it("names the problem the host reports, and a site's list when no site is linked", async () => {
        const tx = makeTx(
            domain({
                siteId: null,
                site: null,
                hostingStatus: "FAILED",
                hostingError: HOSTING_WORDS.blocked,
            }),
        );
        const out = await tellTeam(asTx(tx), ORG, down());
        expect(out.emails[0]!.mail).toMatchObject({
            heading: "Your own domain for your website stopped working",
            url: "https://app.saroh.localhost/sites",
        });
        expect(out.emails[0]!.mail.body).toContain(
            "Our hosting provider blocked it.",
        );
    });
});

describe("a domain that works again", () => {
    it("is told once, after its incident was told", async () => {
        const tx = makeTx(domain());
        await tellTeam(asTx(tx), ORG, down());
        tx.domain.findFirst.mockResolvedValue(
            domain({ hostingStatus: "ACTIVE" }),
        );

        const out = await tellTeam(asTx(tx), ORG, back());
        const twice = await tellTeam(
            asTx(tx),
            ORG,
            back("2026-10-10T11:00:00.000Z"),
        );

        expect(out.told).toBe(true);
        expect(twice.told).toBe(false);
        expect(tx.notification.create).toHaveBeenLastCalledWith({
            data: {
                organizationId: ORG,
                type: DOMAIN_BACK_NOTIFICATION_TYPE,
                title: "shop.ryeandco.in is working again",
                body: "Visitors reach Rye & Co shop at shop.ryeandco.in again.",
            },
            select: { id: true },
        });
        expect(out.emails[0]!.mail).toMatchObject({
            heading: "Your own domain for Rye & Co shop is working again",
            body: "Visitors reach your website at your own domain again.",
        });
    });

    it("then a new incident is told again", async () => {
        const tx = makeTx(domain());
        await tellTeam(asTx(tx), ORG, down());
        tx.domain.findFirst.mockResolvedValue(
            domain({ hostingStatus: "ACTIVE" }),
        );
        await tellTeam(asTx(tx), ORG, back());
        tx.domain.findFirst.mockResolvedValue(domain());

        const next = await tellTeam(
            asTx(tx),
            ORG,
            down({ at: "2026-10-11T10:00:00.000Z" }),
        );

        expect(next.told).toBe(true);
        expect(tx.notification.create).toHaveBeenCalledTimes(3);
    });

    it("says nothing when nobody was told it was down", async () => {
        const tx = makeTx(domain({ hostingStatus: "ACTIVE" }));
        const out = await tellTeam(asTx(tx), ORG, back());
        expect(out.told).toBe(false);
    });

    it("says nothing when it went down again before the alert ran", async () => {
        const tx = makeTx(domain());
        await tellTeam(asTx(tx), ORG, down());
        const out = await tellTeam(asTx(tx), ORG, back());
        expect(out.told).toBe(false);
    });
});

describe("queueing from the check", () => {
    const after = (hostingStatus: string) => ({
        id: "dom_1",
        organizationId: ORG,
        hostingStatus,
        hostingCheckedAt: new Date(AT),
    });

    it("queues a down alert with the check's instant and who pressed Check now", async () => {
        const tx = makeTx(domain());
        await expect(
            queueDomainAlert(
                asTx(tx),
                { hostingStatus: "ACTIVE" },
                after("FAILED"),
                "u_owner",
            ),
        ).resolves.toBe("down");
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                organizationId: ORG,
                type: TEAM_ALERT_TYPE,
                payload: {
                    event: "domain",
                    domainId: "dom_1",
                    change: "down",
                    at: AT,
                    actorUserId: "u_owner",
                },
            },
        });
    });

    it("queues nothing for a domain going live the first time, or no change", async () => {
        const tx = makeTx(domain());
        await expect(
            queueDomainAlert(
                asTx(tx),
                { hostingStatus: "PENDING" },
                after("ACTIVE"),
            ),
        ).resolves.toBeNull();
        await expect(
            queueDomainAlert(
                asTx(tx),
                { hostingStatus: "PENDING" },
                after("FAILED"),
            ),
        ).resolves.toBeNull();
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("queues back only after a told down, and no second down while it lasts", async () => {
        const tx = makeTx(domain());
        tx.claims.push({ eventKey: `team:domain:dom_1:down:${AT}` });

        await expect(
            queueDomainAlert(
                asTx(tx),
                { hostingStatus: "ACTIVE" },
                after("PENDING"),
            ),
        ).resolves.toBeNull();
        await expect(
            queueDomainAlert(
                asTx(tx),
                { hostingStatus: "FAILED" },
                after("ACTIVE"),
            ),
        ).resolves.toBe("back");
        expect(tx.job.create).toHaveBeenCalledTimes(1);
    });
});
