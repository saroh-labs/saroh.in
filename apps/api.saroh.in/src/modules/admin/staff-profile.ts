import { randomInt } from "node:crypto";

import { ServiceUnavailableException } from "@nestjs/common";

import type { EncryptedSecret, EncryptionKey } from "../../common/crypto";
import {
    decryptWithKey,
    encryptWithKey,
    keyedDigest,
} from "../../common/crypto";
import { env } from "../../env";

/**
 * A teammate's job on the Team (DEC-169), separate from their console role.
 * The migration's `StaffProfile_worksAs_check` allows these and no others.
 */
export const STAFF_JOBS = [
    "ACCOUNT_MANAGER_JOB",
    "FINDS_BUSINESSES",
    "OTHER",
] as const;
export type StaffJob = (typeof STAFF_JOBS)[number];

/** How they work with Saroh. `StaffProfile_engagement_check`. */
export const STAFF_ENGAGEMENTS = [
    "FULL_TIME",
    "PART_TIME",
    "FREELANCE",
] as const;
export type StaffEngagement = (typeof STAFF_ENGAGEMENTS)[number];

/**
 * The manager code's alphabet: digits and capitals without the look-alikes
 * 0, 1, I, L and O, so an owner can read it out and type it at sign-up.
 * `StaffProfile_managerCode_check` holds the same set.
 */
export const MANAGER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const MANAGER_CODE_LENGTH = 8;
export const MANAGER_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

/**
 * A new manager code from the system's secure random source: short enough to
 * type, and with 31^8 (about 8.5 × 10^11) codes, not guessable by walking
 * them. Uniqueness is the database's (`StaffProfile_managerCode_key`); the
 * caller retries on a clash.
 */
export function generateManagerCode(): string {
    let code = "";
    for (let i = 0; i < MANAGER_CODE_LENGTH; i++) {
        code += MANAGER_CODE_ALPHABET[randomInt(MANAGER_CODE_ALPHABET.length)];
    }
    return code;
}

function staffPiiKey(): EncryptionKey {
    return {
        name: "STAFF_PII_ENC_KEY",
        value: env.STAFF_PII_ENC_KEY,
        protects: "a teammate's tax id",
    };
}

/**
 * Run a seal or open, turning a missing or malformed key into a 503 that
 * names the variable. The crypto module's messages carry no secret material.
 */
function withStaffKey<T>(work: (key: EncryptionKey) => T): T {
    const key = staffPiiKey();
    try {
        return work(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `Tax ids can't be handled yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

/** A tax id as stored: no spaces, capitals. */
export function normaliseTaxId(value: string): string {
    return value.replace(/\s+/g, "").toUpperCase();
}

export function sealTaxId(taxId: string): EncryptedSecret {
    return withStaffKey((key) => encryptWithKey(taxId, key));
}

/** The last 4 characters of a sealed tax id. The whole never leaves here. */
export function taxIdLast4(sealed: EncryptedSecret): string {
    return withStaffKey((key) => decryptWithKey(sealed, key)).slice(-4);
}

/**
 * What an idempotent save fingerprints in place of the tax id: a keyed
 * digest, so the stored fingerprint can't be brute-forced back to it.
 */
export function taxIdFingerprint(taxId: string): string {
    return withStaffKey((key) => keyedDigest(taxId, "staff-tax-id", key));
}
