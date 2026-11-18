/**
 * Meta's callbacks (U8) against a real Postgres: a valid signed request
 * for each login is taken, a bad signature is a 400 and an old one is
 * refused; deauthorize marks the person's channel; data deletion removes
 * their channels and tokens and answers the status page's address and
 * code, which the page reads without anyone signed in.
 */
import { prisma } from "@saroh/database";

import {
    restoreSocialEnv,
    socialBusiness,
    socialEnv,
    uniq,
} from "../../../../test/fixtures/social";
import { env } from "../../../env";
import { MetaCallbacksService } from "./meta-callbacks.controller";
import { signRequest } from "./signed-request";
import type { ChannelKind } from "./social-meta.port";

const mutableEnv = env as {
    META_APP_SECRET?: string;
    INSTAGRAM_APP_SECRET?: string;
    THREADS_APP_SECRET?: string;
};
const saved = { ...mutableEnv };
const SECRETS: Record<ChannelKind, string> = {
    FACEBOOK: "fb-test-secret",
    INSTAGRAM: "ig-test-secret",
    THREADS: "th-test-secret",
};

beforeAll(() => {
    socialEnv();
    mutableEnv.META_APP_SECRET = SECRETS.FACEBOOK;
    mutableEnv.INSTAGRAM_APP_SECRET = SECRETS.INSTAGRAM;
    mutableEnv.THREADS_APP_SECRET = SECRETS.THREADS;
});
afterAll(async () => {
    Object.assign(mutableEnv, saved);
    restoreSocialEnv();
    await prisma.$disconnect();
});

const service = new MetaCallbacksService();

async function connected(kind: ChannelKind) {
    const ctx = await socialBusiness();
    const userId = uniq("meta-user");
    const row = await prisma.socialChannel.create({
        data: {
            organizationId: ctx.organizationId,
            kind,
            accountId: uniq("acct"),
            platformUserId: userId,
            handle: "@chaiandcrumb",
            tokenCiphertext: "sealed",
            tokenIv: "iv",
            tokenAuthTag: "tag",
        },
    });
    return { row, userId };
}

const signed = (
    kind: ChannelKind,
    userId: string,
    issuedAt = Date.now() / 1000,
) =>
    signRequest(
        {
            algorithm: "HMAC-SHA256",
            issued_at: Math.floor(issuedAt),
            user_id: userId,
        },
        SECRETS[kind],
    );

describe.each(["INSTAGRAM", "FACEBOOK", "THREADS"] as const)(
    "%s callbacks",
    (kind) => {
        it("marks the person's channel when they take Saroh's access away", async () => {
            const { row, userId } = await connected(kind);
            expect(
                await service.deauthorize(kind, signed(kind, userId)),
            ).toEqual({
                marked: 1,
            });
            expect(
                await prisma.socialChannel.findUniqueOrThrow({
                    where: { id: row.id },
                }),
            ).toMatchObject({
                status: "NEEDS_ATTENTION",
                tokenCiphertext: null,
            });
        });

        it("deletes their channels and answers the status page's address and code", async () => {
            const { row, userId } = await connected(kind);
            const out = await service.dataDeletion(kind, signed(kind, userId));
            expect(out.url).toMatch(
                new RegExp(`/social/deletion/${out.confirmation_code}$`),
            );
            expect(
                await prisma.socialChannel.count({ where: { id: row.id } }),
            ).toBe(0);
            expect(await service.status(out.confirmation_code)).toMatchObject({
                kind,
                channels: 1,
            });
        });

        it("refuses a bad signature and an old request", async () => {
            const { userId } = await connected(kind);
            const bad = signRequest(
                { issued_at: Date.now() / 1000, user_id: userId },
                "nope",
            );
            await expect(service.deauthorize(kind, bad)).rejects.toMatchObject({
                status: 400,
            });
            await expect(
                service.dataDeletion(
                    kind,
                    signed(kind, userId, Date.now() / 1000 - 3 * 86_400),
                ),
            ).rejects.toMatchObject({ status: 400 });
        });
    },
);
