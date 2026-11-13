import { ServiceUnavailableException } from "@nestjs/common";

import type { EncryptedSecret, EncryptionKey } from "../../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../../common/crypto";
import { env } from "../../../env";

/**
 * Ask AI's text at rest (DEC-220): every message body and conversation
 * title is sealed with the `AI_TEXT_ENC_KEY` ring (DEC-214) through
 * `common/crypto.ts`, so the database never holds a question or an answer
 * in the clear.
 *
 * Bound to its place: the crypto helper takes no associated data, so the
 * sealed plaintext is an envelope `{ o, c, r, f, t }` (business,
 * conversation, row, field, text) and opening checks the first four
 * against where the row is. GCM authenticates the whole envelope, so a
 * ciphertext copied to another row, conversation or business opens to a
 * mismatch and is refused. A re-seal (`cli/keys-reseal.ts`) moves the
 * envelope whole, binding and all.
 *
 * No key: a clear 503 at the moment text is sealed or opened, never at boot.
 */

export function aiTextKey(): EncryptionKey {
    return {
        name: "AI_TEXT_ENC_KEY",
        value: env.AI_TEXT_ENC_KEY,
        protects: "Ask AI's conversations",
    };
}

/**
 * Where a sealed text belongs. `rowId` is the message's id, the
 * conversation's for its title, the draft's for a draft (U5), or the
 * report's for a report (U8).
 */
export interface AiSealBinding {
    organizationId: string;
    conversationId: string;
    rowId: string;
    field: "body" | "title" | "draft" | "report";
}

/** A message as sealed: its text, and the card's data when it has one. */
export interface AiMessageContent {
    text: string;
    card?: Record<string, unknown>;
}

interface Envelope {
    o: string;
    c: string;
    r: string;
    f: string;
    t: string;
}

/** Sealed text that was opened somewhere it doesn't belong. */
export class AiSealMismatchError extends Error {
    constructor() {
        super("Ask AI text was sealed for another row");
        this.name = "AiSealMismatchError";
    }
}

/** A seal or open, with a missing or malformed key turned into a 503 that names the variable. */
function withAiKey<T>(work: (key: EncryptionKey) => T): T {
    const key = aiTextKey();
    try {
        return work(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `Ask AI can't keep conversations yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

export function sealAiText(text: string, b: AiSealBinding): EncryptedSecret {
    const envelope: Envelope = {
        o: b.organizationId,
        c: b.conversationId,
        r: b.rowId,
        f: b.field,
        t: text,
    };
    return withAiKey((key) => encryptWithKey(JSON.stringify(envelope), key));
}

export function openAiText(sealed: EncryptedSecret, b: AiSealBinding): string {
    const e = withAiKey(
        (key) => JSON.parse(decryptWithKey(sealed, key)) as Envelope,
    );
    if (
        e.o !== b.organizationId ||
        e.c !== b.conversationId ||
        e.r !== b.rowId ||
        e.f !== b.field
    ) {
        throw new AiSealMismatchError();
    }
    return e.t;
}

type Where = Omit<AiSealBinding, "field">;

export const sealMessageBody = (content: AiMessageContent, b: Where) =>
    sealAiText(JSON.stringify(content), { ...b, field: "body" });

export const openMessageBody = (
    sealed: EncryptedSecret,
    b: Where,
): AiMessageContent =>
    JSON.parse(openAiText(sealed, { ...b, field: "body" })) as AiMessageContent;

/** The three sealed parts as a row stores them, or null when any is missing. */
export const sealedParts = (
    ciphertext: string | null,
    iv: string | null,
    authTag: string | null,
): EncryptedSecret | null =>
    ciphertext && iv && authTag ? { ciphertext, iv, authTag } : null;

/** A draft's sealed part as `T` (U5): its input, the values before, and after. */
export const sealDraftBody = (content: unknown, b: Where) =>
    sealAiText(JSON.stringify(content), { ...b, field: "draft" });

export const openDraftBody = <T>(sealed: EncryptedSecret, b: Where): T =>
    JSON.parse(openAiText(sealed, { ...b, field: "draft" })) as T;

/** A report's sealed part (U8): the chosen question and answer, and the note. */
export interface AiReportContent {
    question: string;
    answer: string;
    note: string | null;
}

export const sealReportBody = (content: AiReportContent, b: Where) =>
    sealAiText(JSON.stringify(content), { ...b, field: "report" });

export const openReportBody = (
    sealed: EncryptedSecret,
    b: Where,
): AiReportContent =>
    JSON.parse(
        openAiText(sealed, { ...b, field: "report" }),
    ) as AiReportContent;
