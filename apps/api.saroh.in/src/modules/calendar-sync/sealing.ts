import { ServiceUnavailableException } from "@nestjs/common";

import type { EncryptedSecret, EncryptionKey } from "../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../common/crypto";
import { env } from "../../env";

/**
 * A person's Google refresh token at rest (#1047), sealed with the
 * `CALENDAR_ENC_KEY` ring (DEC-214) through `common/crypto.ts`, as Ask AI
 * seals its text (`ai/history/sealing.ts`).
 *
 * Bound to its row: the sealed plaintext is an envelope `{ o, c, t }`
 * (business, connection, token), and opening checks the first two, so a
 * token copied to another connection or business is refused. A re-seal
 * (`cli/keys-reseal.ts`) moves the envelope whole.
 *
 * No key: a clear 503 at the moment a token is sealed or opened, never at
 * boot.
 */

export function calendarKey(): EncryptionKey {
    return {
        name: "CALENDAR_ENC_KEY",
        value: env.CALENDAR_ENC_KEY,
        protects: "Google Calendar connections",
    };
}

export interface TokenBinding {
    organizationId: string;
    connectionId: string;
}

interface Envelope {
    o: string;
    c: string;
    t: string;
}

/** A token opened somewhere it doesn't belong. */
export class CalendarSealMismatchError extends Error {
    constructor() {
        super("Google token was sealed for another connection");
        this.name = "CalendarSealMismatchError";
    }
}

/** Work with the key, a missing or malformed one turned into a 503 that names it. */
export function withCalendarKey<T>(work: (key: EncryptionKey) => T): T {
    const key = calendarKey();
    try {
        return work(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `Google Calendar can't be connected yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

export function sealToken(token: string, b: TokenBinding): EncryptedSecret {
    const envelope: Envelope = {
        o: b.organizationId,
        c: b.connectionId,
        t: token,
    };
    return withCalendarKey((key) =>
        encryptWithKey(JSON.stringify(envelope), key),
    );
}

export function openToken(sealed: EncryptedSecret, b: TokenBinding): string {
    const e = withCalendarKey(
        (key) => JSON.parse(decryptWithKey(sealed, key)) as Envelope,
    );
    if (e.o !== b.organizationId || e.c !== b.connectionId) {
        throw new CalendarSealMismatchError();
    }
    return e.t;
}

/** The sealed parts as a row keeps them, or null when any is missing. */
export const sealedToken = (row: {
    tokenCiphertext: string | null;
    tokenIv: string | null;
    tokenAuthTag: string | null;
}): EncryptedSecret | null =>
    row.tokenCiphertext && row.tokenIv && row.tokenAuthTag
        ? {
              ciphertext: row.tokenCiphertext,
              iv: row.tokenIv,
              authTag: row.tokenAuthTag,
          }
        : null;

/** A sealed token as the row's three columns. */
export const tokenColumns = (s: EncryptedSecret) => ({
    tokenCiphertext: s.ciphertext,
    tokenIv: s.iv,
    tokenAuthTag: s.authTag,
});
