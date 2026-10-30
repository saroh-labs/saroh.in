import { prisma } from "@saroh/database";

import {
    claimCodeMail,
    CODE_MAIL_COOLDOWN_SECONDS,
    CODE_MAILS_PER_ADDRESS_PER_HOUR,
    emailHash,
} from "./code-mail-limits";

/** The per-address cap on sign-in codes for Saroh accounts. */
describe("claimCodeMail", () => {
    const t0 = new Date("2026-10-30T10:00:00.000Z");
    const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

    beforeEach(async () => {
        await prisma.accountEmailCodeSend.deleteMany();
    });

    it("lets one through, then holds the address for the cooldown", async () => {
        expect(await claimCodeMail("asha@example.com", t0)).toBeNull();
        expect(await claimCodeMail("asha@example.com", at(10))).toEqual({
            retryAfterSeconds: CODE_MAIL_COOLDOWN_SECONDS - 10,
        });
        // Another address is not held up, and case doesn't make a new one.
        expect(await claimCodeMail("ravi@example.com", at(10))).toBeNull();
        expect(await claimCodeMail("ASHA@example.com ", at(20))).not.toBeNull();
        expect(
            await claimCodeMail(
                "asha@example.com",
                at(CODE_MAIL_COOLDOWN_SECONDS),
            ),
        ).toBeNull();
    });

    it(`allows ${CODE_MAILS_PER_ADDRESS_PER_HOUR} an hour, then says when the oldest ages out`, async () => {
        for (let i = 0; i < CODE_MAILS_PER_ADDRESS_PER_HOUR; i++) {
            expect(
                await claimCodeMail("asha@example.com", at(i * 60)),
            ).toBeNull();
        }
        const late = at(CODE_MAILS_PER_ADDRESS_PER_HOUR * 60);
        expect(await claimCodeMail("asha@example.com", late)).toEqual({
            retryAfterSeconds: 3600 - CODE_MAILS_PER_ADDRESS_PER_HOUR * 60,
        });
        expect(await claimCodeMail("asha@example.com", at(3600))).toBeNull();
    });

    it("a burst at once passes one, and keeps only the hash", async () => {
        const verdicts = await Promise.all(
            Array.from({ length: 8 }, () =>
                claimCodeMail("burst@example.com", t0),
            ),
        );
        expect(verdicts.filter((v) => v === null)).toHaveLength(1);
        const rows = await prisma.accountEmailCodeSend.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.emailHash).toBe(emailHash("burst@example.com"));
        expect(JSON.stringify(rows)).not.toContain("burst@");
    });
});
