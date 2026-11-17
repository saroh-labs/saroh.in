import { createCipheriv, randomBytes } from "node:crypto";

import type { Db } from "./helpers";

/**
 * Ask AI conversations already asked, for the marketing shots (the release
 * run has no model key, so nothing here calls one): the rows the API writes
 * for a finished turn (`ai/turn/turn-store.ts`, `ai/drafts/drafts.service.ts`),
 * sealed as `ai/history/sealing.ts` seals them, with `AI_TEXT_ENC_KEY` (the
 * API's key on the same stack, so the API can open them). With no key set
 * none are written: the API couldn't open them.
 */

/** A product change drafted and left unconfirmed (its card's Change product, Cancel). */
export interface SeedAskDraft {
    id: string;
    turnId: string;
    productId: string;
    description: string;
    expiresAt: Date;
}

export interface SeedAskConversation {
    id: string;
    title: string;
    at: Date;
    /** The question and its answer: one turn. */
    question: string;
    answer: string;
    /** The read tools' cards under the answer. */
    cards?: { kind: string; data: Record<string, unknown> }[];
    draft?: SeedAskDraft;
}

interface Ring {
    id: string;
    key: Buffer;
}

/** The newest key of the ring (`common/crypto.ts`'s `loadRing`), or null when unset. */
function newestKey(value: string | undefined): Ring | null {
    if (!value) return null;
    const first = value.split(",")[0].trim();
    const cut = first.indexOf(":");
    const id = cut === -1 ? "v1" : first.slice(0, cut).trim();
    const raw = cut === -1 ? first : first.slice(cut + 1).trim();
    const key = /^[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw, "hex")
        : Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("AI_TEXT_ENC_KEY must decode to 32 bytes");
    }
    return { id, key };
}

/** `sealAiText`: the envelope `{ o, c, r, f, t }` under AES-256-GCM. */
export function sealForRow(
    ring: Ring,
    text: string,
    b: { o: string; c: string; r: string; f: "body" | "title" | "draft" },
) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", ring.key, iv);
    const body = Buffer.concat([
        cipher.update(JSON.stringify({ ...b, t: text }), "utf8"),
        cipher.final(),
    ]).toString("base64");
    return {
        ciphertext: ring.id === "v1" ? body : `${ring.id}:${body}`,
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}

/** The end of the local day `now` falls on, in `zone` (a draft's `expiresAt`). */
export function endOfLocalDay(now: Date, zone: string): Date {
    const [y, m, d] = now
        .toLocaleDateString("en-CA", { timeZone: zone })
        .split("-")
        .map(Number);
    const naive = Date.UTC(y, m - 1, d + 1);
    const local = new Date(
        new Date(naive).toLocaleString("en-US", { timeZone: zone }),
    );
    const utc = new Date(
        new Date(naive).toLocaleString("en-US", { timeZone: "UTC" }),
    );
    return new Date(naive - (local.getTime() - utc.getTime()) - 1);
}

/** "9 Nov": a day as the API's cards write it, where the business is. */
export const dayLabel = (at: Date, zone: string) =>
    at.toLocaleDateString("en-GB", {
        timeZone: zone,
        day: "numeric",
        month: "short",
    });

/**
 * Write `conversations` for `userId` at the business, replacing any earlier
 * run's (same ids). Returns how many were written: 0 with no key.
 */
export async function writeAskConversations(
    prisma: Db,
    organizationId: string,
    userId: string,
    conversations: readonly SeedAskConversation[],
    env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    const ring = newestKey(env.AI_TEXT_ENC_KEY);
    if (!ring) {
        console.log(
            "[ask-ai] AI_TEXT_ENC_KEY unset: no Ask AI conversations seeded",
        );
        return 0;
    }
    await prisma.aiConversation.deleteMany({
        where: { id: { in: conversations.map((c) => c.id) } },
    });
    for (const c of conversations) {
        const seal = (r: string, f: "body" | "title" | "draft", t: string) =>
            sealForRow(ring, t, { o: organizationId, c: c.id, r, f });
        const title = seal(c.id, "title", c.title);
        const answeredAt = new Date(c.at.getTime() + 5_000);
        await prisma.aiConversation.create({
            data: {
                id: c.id,
                organizationId,
                userId,
                agent: "ask-ai",
                agentVersion: "seed",
                model: "claude-haiku-5-5",
                effort: "low",
                titleCiphertext: title.ciphertext,
                titleIv: title.iv,
                titleAuthTag: title.authTag,
                lastMessageAt: answeredAt,
                createdAt: c.at,
            },
        });

        let card: Record<string, unknown> | undefined;
        if (c.draft) {
            const d = c.draft;
            const p = await prisma.product.findUniqueOrThrow({
                where: { id: d.productId },
                select: {
                    name: true,
                    price: true,
                    description: true,
                    status: true,
                    currency: true,
                    updatedAt: true,
                },
            });
            card = {
                draftId: d.id,
                tool: "update_product",
                kind: "product",
                action: "edit",
                status: "drafted",
                targetId: d.productId,
                targetName: p.name,
                fields: [
                    {
                        field: "description",
                        label: "Description",
                        old: p.description,
                        new: d.description,
                    },
                ],
                missing: [],
                refusal: null,
                note: null,
                expiresAt: d.expiresAt.toISOString(),
            };
            // shortcut: `previous` leaves out stock, so a Confirm on a seeded
            // draft is refused as changed; seed stock here if a demo confirms one.
            const body = seal(
                d.id,
                "draft",
                JSON.stringify({
                    input: {
                        product_id: d.productId,
                        description: d.description,
                    },
                    previous: {
                        name: p.name,
                        updatedAt: p.updatedAt.toISOString(),
                        currency: p.currency,
                        fields: {
                            name: p.name,
                            price: Number(p.price),
                            description: p.description,
                            status: p.status.toLowerCase(),
                            stock: null,
                        },
                    },
                    card,
                }),
            );
            await prisma.askAiDraft.create({
                data: {
                    id: d.id,
                    organizationId,
                    userId,
                    conversationId: c.id,
                    turnId: d.turnId,
                    tool: "update_product",
                    status: "DRAFTED",
                    targetId: d.productId,
                    targetUpdatedAt: p.updatedAt,
                    bodyCiphertext: body.ciphertext,
                    bodyIv: body.iv,
                    bodyAuthTag: body.authTag,
                    expiresAt: d.expiresAt,
                    createdAt: answeredAt,
                },
            });
        }

        const messages = [
            {
                id: `${c.id}_q`,
                at: c.at,
                role: "USER" as const,
                body: { text: c.question },
            },
            {
                id: `${c.id}_a`,
                at: answeredAt,
                role: "ASSISTANT" as const,
                body: {
                    text: c.answer,
                    ...(card ? { card: { kind: "draft", data: card } } : {}),
                    ...(c.cards ? { cards: c.cards } : {}),
                },
            },
        ];
        for (const m of messages) {
            const body = seal(m.id, "body", JSON.stringify(m.body));
            await prisma.aiMessage.create({
                data: {
                    id: m.id,
                    organizationId,
                    conversationId: c.id,
                    role: m.role,
                    bodyCiphertext: body.ciphertext,
                    bodyIv: body.iv,
                    bodyAuthTag: body.authTag,
                    outcome:
                        m.role === "USER" ? null : card ? "DRAFT" : "ANSWERED",
                    createdAt: m.at,
                },
            });
        }
    }
    return conversations.length;
}
