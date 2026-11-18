import { ServiceUnavailableException } from "@nestjs/common";

import type { EncryptedSecret, EncryptionKey } from "../../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../../common/crypto";
import { env } from "../../../env";

/**
 * A channel's token at rest (U4), sealed with the `SOCIAL_ENC_KEY` ring
 * (DEC-214) through `common/crypto.ts`, as the Google Calendar connection
 * seals its token.
 *
 * Bound to its row: the sealed plaintext is an envelope `{ o, r, v }`
 * (business, row, value), and opening checks the first two, so a token
 * copied to another channel or business is refused. The Facebook Page
 * choice is sealed the same way, bound to its own row.
 *
 * No key: a clear 503 at the moment something is sealed or opened, never
 * at boot.
 */

export function socialKey(): EncryptionKey {
    return {
        name: "SOCIAL_ENC_KEY",
        value: env.SOCIAL_ENC_KEY,
        protects: "Saroh Social channels",
    };
}

export interface SealBinding {
    organizationId: string;
    /** The channel's (or the choice's) id. */
    rowId: string;
}

interface Envelope {
    o: string;
    r: string;
    v: string;
}

/** A value opened somewhere it doesn't belong. */
export class SocialSealMismatchError extends Error {
    constructor() {
        super("Saroh Social token was sealed for another row");
        this.name = "SocialSealMismatchError";
    }
}

/** Work with the key, a missing or malformed one turned into a 503 that names it. */
export function withSocialKey<T>(work: (key: EncryptionKey) => T): T {
    const key = socialKey();
    try {
        return work(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `Saroh Social can't connect channels yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

export function seal(value: string, b: SealBinding): EncryptedSecret {
    const envelope: Envelope = { o: b.organizationId, r: b.rowId, v: value };
    return withSocialKey((key) =>
        encryptWithKey(JSON.stringify(envelope), key),
    );
}

export function unseal(sealed: EncryptedSecret, b: SealBinding): string {
    const e = withSocialKey(
        (key) => JSON.parse(decryptWithKey(sealed, key)) as Envelope,
    );
    if (e.o !== b.organizationId || e.r !== b.rowId) {
        throw new SocialSealMismatchError();
    }
    return e.v;
}

/** The sealed token as a channel row keeps it, or null when any part is missing. */
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

/** The columns a dropped token clears. */
export const NO_TOKEN = {
    tokenCiphertext: null,
    tokenIv: null,
    tokenAuthTag: null,
} as const;
