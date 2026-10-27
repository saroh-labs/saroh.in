// The handlers are called directly; the session guard (and Better Auth's
// ESM build behind it) is never reached.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CatalogueService } from "../pricing/catalogue.service";
import { ImpactService } from "../pricing/impact.service";
import {
    MessagingController,
    PublicVerificationsController,
} from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { FakeMessagingProvider } from "./providers/fake-messaging-provider";
import { VerificationSendService } from "./verification-send.service";
import { VerificationService } from "./verification.service";
import { WalletService } from "./wallet.service";

/**
 * Sending a customer a code (#1242, DEC-191): the module switch, the
 * catalogue's WhatsApp price, the abuse limits, the wallet hold and the
 * WhatsApp send, and the HTTP surface over them. The price is made up.
 */
const PRICE = 7;
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const nextPhone = () => `+9198451${String(10_000 + n++).slice(-5)}`;

let version = 0;
async function publishPrices(edit: (c: Catalog) => void) {
    version += 1;
    const catalog = fakeCatalog(edit);
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt: new Date(Date.now() - 1000),
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

const verification = new VerificationService();
const wallet = new WalletService();
const transport = new FakeMessagingProvider();
const send = new VerificationSendService(
    verification,
    wallet,
    new CatalogueService(new ImpactService()),
    new MessagingService(transport),
);

async function business(opts: { on?: boolean; balance?: number } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("send") },
    });
    if (opts.on !== false) {
        await verification.setEnabled(org.id, "BOOKING", true);
    }
    if (opts.balance !== 0) {
        await wallet.credit(org.id, opts.balance ?? 100);
    }
    return org.id;
}

const ledgerKinds = async (organizationId: string) =>
    (
        await prisma.messagingLedgerEntry.findMany({
            where: { organizationId },
            select: { kind: true },
        })
    ).map((e) => e.kind);

describe("VerificationSendService.sendCode", () => {
    beforeAll(async () => {
        // Every business here is approved for phone codes (DEC-196) but the
        // one a test refuses with its own override.
        await prisma.featureFlag.create({
            data: { key: "CUSTOMER_PHONE_CODES", enabledByDefault: true },
        });
        await publishPrices((c) => {
            c.messagePrices = { whatsapp: PRICE };
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("refuses a business the owner hasn't approved, whatever its switch and balance", async () => {
        const orgId = await business();
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "CUSTOMER_PHONE_CODES",
                organizationId: orgId,
                enabled: false,
            },
        });
        const sends = transport.sends.length;
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: nextPhone(),
            }),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "PHONE_CODES_NOT_APPROVED" } },
        });
        expect(transport.sends.length).toBe(sends);
        expect(await send.canSend(orgId, "BOOKING")).toBe(false);
        await expect(
            verification.setEnabled(orgId, "ACCOUNT", true),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "PHONE_CODES_NOT_APPROVED" } },
        });
        // Turning a module off is never refused.
        await expect(
            verification.setEnabled(orgId, "BOOKING", false),
        ).resolves.toContainEqual({ module: "BOOKING", enabled: false });
    });

    it("refuses a module that is off: no session, no hold, no send", async () => {
        const orgId = await business({ on: false });
        const sends = transport.sends.length;
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: nextPhone(),
            }),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "VERIFICATION_OFF" } },
        });
        expect(transport.sends.length).toBe(sends);
        expect(
            await prisma.phoneVerification.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
        expect(await wallet.get(orgId)).toMatchObject({ heldPaise: 0 });
    });

    it("sends on WhatsApp and keeps the hold, charging nothing yet", async () => {
        const orgId = await business();
        const phone = nextPhone();
        const out = await send.sendCode({
            organizationId: orgId,
            module: "BOOKING",
            phoneE164: phone,
            subjectRef: "booking_1",
        });
        expect(Object.keys(out).sort()).toEqual([
            "expiresAt",
            "verificationId",
        ]);
        expect(transport.sends.at(-1)?.toE164).toBe(phone);
        const row = await prisma.messagingSend.findFirstOrThrow({
            where: { verificationId: out.verificationId },
        });
        expect(row).toMatchObject({
            channel: "WHATSAPP",
            status: "SENT",
            pricePaise: PRICE,
            chargedAt: null,
            releasedAt: null,
        });
        expect(row.providerMessageId).toMatch(/^fake_whatsapp_/);
        expect(await wallet.get(orgId)).toMatchObject({
            balancePaise: 100,
            heldPaise: PRICE,
        });
        expect(await ledgerKinds(orgId)).toEqual(["TOPUP"]);
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: out.verificationId },
            }),
        ).resolves.toMatchObject({ status: "PENDING" });
    });

    it("frees the hold and fails the session for a number not on WhatsApp", async () => {
        const orgId = await business();
        const phone = nextPhone();
        transport.markIneligible(phone);
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: phone,
            }),
        ).rejects.toMatchObject({
            status: 422,
            response: { details: { code: "NOT_ON_WHATSAPP" } },
        });
        const session = await prisma.phoneVerification.findFirstOrThrow({
            where: { organizationId: orgId },
            include: { sends: true },
        });
        expect(session.status).toBe("FAILED");
        expect(session.sends).toHaveLength(1);
        expect(session.sends[0]).toMatchObject({
            status: "FAILED",
            failureReason: "not_on_whatsapp",
        });
        expect(session.sends[0]?.releasedAt).toBeInstanceOf(Date);
        expect(await wallet.get(orgId)).toMatchObject({
            balancePaise: 100,
            heldPaise: 0,
        });
        expect((await ledgerKinds(orgId)).sort()).toEqual(["RELEASE", "TOPUP"]);
    });

    it("treats a provider refusal or a transport throw the same way", async () => {
        const orgId = await business();
        const refused = nextPhone();
        transport.reject(refused, "template_paused");
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: refused,
            }),
        ).rejects.toMatchObject({
            status: 503,
            response: { details: { code: "SEND_FAILED" } },
        });

        const throwing = nextPhone();
        const spy = jest
            .spyOn(transport, "sendWhatsappAuth")
            .mockRejectedValueOnce(new Error("timeout"));
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: throwing,
            }),
        ).rejects.toMatchObject({ status: 503 });
        spy.mockRestore();

        const failed = await prisma.messagingSend.findMany({
            where: { organizationId: orgId },
            select: { status: true, failureReason: true },
            orderBy: { createdAt: "asc" },
        });
        expect(failed).toEqual([
            { status: "FAILED", failureReason: "template_paused" },
            { status: "FAILED", failureReason: "transport_error" },
        ]);
        expect(await wallet.get(orgId)).toMatchObject({ heldPaise: 0 });
        expect(await ledgerKinds(orgId)).not.toContain("DEBIT");
    });

    it("asks for a top-up before reaching the provider", async () => {
        const orgId = await business({ balance: PRICE - 1 });
        const sends = transport.sends.length;
        await expect(
            send.sendCode({
                organizationId: orgId,
                module: "BOOKING",
                phoneE164: nextPhone(),
            }),
        ).rejects.toMatchObject({
            status: 402,
            response: { details: { code: "INSUFFICIENT_BALANCE" } },
        });
        expect(transport.sends.length).toBe(sends);
        expect(
            await prisma.messagingSend.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
        await expect(
            prisma.phoneVerification.findFirstOrThrow({
                where: { organizationId: orgId },
            }),
        ).resolves.toMatchObject({ status: "FAILED" });
    });

    it("refuses when the live catalogue prices no WhatsApp", async () => {
        const orgId = await business();
        await publishPrices((c) => {
            c.messagePrices = { sms: PRICE };
        });
        const sends = transport.sends.length;
        try {
            await expect(
                send.sendCode({
                    organizationId: orgId,
                    module: "BOOKING",
                    phoneE164: nextPhone(),
                }),
            ).rejects.toMatchObject({
                status: 503,
                response: { details: { code: "PRICE_UNAVAILABLE" } },
            });
        } finally {
            await publishPrices((c) => {
                c.messagePrices = { whatsapp: PRICE };
            });
        }
        expect(transport.sends.length).toBe(sends);
        expect(await wallet.get(orgId)).toMatchObject({ heldPaise: 0 });
        expect(
            await prisma.phoneVerification.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
    });

    it("holds nothing when the abuse limits refuse", async () => {
        const orgId = await business();
        const phone = nextPhone();
        const input = {
            organizationId: orgId,
            module: "BOOKING" as const,
            phoneE164: phone,
        };
        await send.sendCode(input);
        const sends = transport.sends.length;
        // Inside the 30-second resend cooldown.
        await expect(send.sendCode(input)).rejects.toMatchObject({
            status: 429,
        });
        expect(transport.sends.length).toBe(sends);
        expect(await wallet.get(orgId)).toMatchObject({ heldPaise: PRICE });
    });
});

describe("the messaging controllers", () => {
    const owner = new MessagingController(verification, wallet);
    const site = new PublicVerificationsController(send, verification);

    const ctx = (organizationId: string, role: "OWNER" | "MEMBER") =>
        ({ organizationId, userId: "user_1", role }) as OrganizationContext;

    async function publishedSite(organizationId: string) {
        const subdomain = `verify${++n}x${process.pid}`;
        const created = await prisma.site.create({
            data: {
                organizationId,
                name: "Rye & Co.",
                slug: uniq("site"),
                subdomain,
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: created.id,
                organizationId,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: created.id },
            data: { currentPublicationId: publication.id },
        });
        return {
            host: `${subdomain}.saroh.app`,
            address: "203.0.113.9",
            clientHash: uniq("hash"),
        };
    }

    beforeAll(async () => {
        await publishPrices((c) => {
            c.messagePrices = { whatsapp: PRICE };
        });
    });

    it("needs comms:manage on every owner route", async () => {
        const orgId = await business({ on: false });
        const member = ctx(orgId, "MEMBER");
        const refused = { status: 403 };
        expect(() => owner.settings(member)).toThrow(
            expect.objectContaining(refused),
        );
        expect(() =>
            owner.setSetting(member, { module: "ORDER", enabled: true }),
        ).toThrow(expect.objectContaining(refused));
        expect(() => owner.walletView(member)).toThrow(
            expect.objectContaining(refused),
        );
        expect(() => owner.ledger(member, {})).toThrow(
            expect.objectContaining(refused),
        );
        expect(() => owner.summary(member)).toThrow(
            expect.objectContaining(refused),
        );
    });

    it("lets the owner turn a module on and read the balance and summary", async () => {
        const orgId = await business({ on: false });
        const me = ctx(orgId, "OWNER");
        await expect(owner.settings(me)).resolves.toEqual([
            { module: "BOOKING", enabled: false },
            { module: "ORDER", enabled: false },
            { module: "ACCOUNT", enabled: false },
        ]);
        await expect(
            owner.setSetting(me, { module: "ORDER", enabled: true }),
        ).resolves.toContainEqual({ module: "ORDER", enabled: true });
        await expect(owner.walletView(me)).resolves.toMatchObject({
            balancePaise: 100,
            availablePaise: 100,
        });
        await expect(owner.ledger(me, { limit: 10 })).resolves.toMatchObject({
            entries: [expect.objectContaining({ kind: "TOPUP" })],
            nextCursor: null,
        });

        const relay = await publishedSite(orgId);
        const { verificationId } = await site.start(relay, {
            module: "ORDER",
            phone: nextPhone(),
        });
        await site.start(relay, { module: "ORDER", phone: nextPhone() });
        const code = transport.sends.at(-2)?.code ?? "";
        await site.check(relay, verificationId, { code });
        await expect(owner.summary(me)).resolves.toEqual({
            started: 2,
            verified: 1,
            rate: 0.5,
        });
    });

    it("lets the owner switch site sign-in codes (ACCOUNT) on and off, which is what offers them", async () => {
        const orgId = await business({ on: false });
        const me = ctx(orgId, "OWNER");
        expect(await send.canSend(orgId, "ACCOUNT")).toBe(false);
        await expect(
            owner.setSetting(me, { module: "ACCOUNT", enabled: true }),
        ).resolves.toContainEqual({ module: "ACCOUNT", enabled: true });
        expect(await send.canSend(orgId, "ACCOUNT")).toBe(true);
        await expect(
            owner.setSetting(me, { module: "ACCOUNT", enabled: false }),
        ).resolves.toContainEqual({ module: "ACCOUNT", enabled: false });
        expect(await send.canSend(orgId, "ACCOUNT")).toBe(false);
    });

    it("starts and checks a code on the site, never answering with the code", async () => {
        const orgId = await business();
        const relay = await publishedSite(orgId);
        const started = await site.start(relay, {
            module: "BOOKING",
            phone: "98450 77777",
        });
        const code = transport.sends.at(-1)?.code ?? "";
        expect(JSON.stringify(started)).not.toContain(code);
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: started.verificationId },
            }),
        ).resolves.toMatchObject({
            organizationId: orgId,
            ipHash: relay.clientHash,
            phoneE164: "+919845077777",
        });

        const wrong = code === "000000" ? "111111" : "000000";
        await expect(
            site.check(relay, started.verificationId, { code: wrong }),
        ).rejects.toMatchObject({
            status: 400,
            response: { details: { code: "WRONG_CODE" } },
        });
        const ok = await site.check(relay, started.verificationId, { code });
        expect(ok).toEqual({ status: "VERIFIED" });
        expect(JSON.stringify(ok)).not.toContain(code);
        await expect(
            site.check(relay, started.verificationId, { code }),
        ).rejects.toMatchObject({
            status: 410,
            response: { details: { code: "ALREADY_USED" } },
        });
    });

    it("can't check another business's session", async () => {
        const a = await publishedSite(await business());
        const b = await publishedSite(await business());
        const { verificationId } = await site.start(a, {
            module: "BOOKING",
            phone: nextPhone(),
        });
        await expect(
            site.check(b, verificationId, {
                code: transport.sends.at(-1)?.code ?? "",
            }),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("sends nothing on a demo business", async () => {
        const orgId = await business();
        await prisma.organization.update({
            where: { id: orgId },
            data: { isDemo: true },
        });
        const relay = await publishedSite(orgId);
        const sends = transport.sends.length;
        await expect(
            site.start(relay, { module: "BOOKING", phone: nextPhone() }),
        ).rejects.toMatchObject({
            status: 403,
            response: { details: { code: "ORGANIZATION_DEMO" } },
        });
        expect(transport.sends.length).toBe(sends);
    });
});
