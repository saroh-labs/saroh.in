import { NotFoundException } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";

import type { ChannelKind } from "../meta/social-meta.port";
import { CHANNEL_KINDS } from "../meta/social-meta.port";

/** The three rows Channels shows, in this order. */
export const CHANNEL_ORDER: readonly ChannelKind[] = CHANNEL_KINDS;

/** `instagram`, `facebook`, `threads`: a kind as an address names it. */
export const kindPath = (kind: ChannelKind) => kind.toLowerCase();

/** A kind from an address, or 404. */
export function kindParam(value: string): ChannelKind {
    const kind = value.toUpperCase();
    if (!(CHANNEL_KINDS as readonly string[]).includes(kind)) {
        throw new NotFoundException("No such channel.");
    }
    return kind as ChannelKind;
}

/** One row of Social › Channels (S2). */
export interface ChannelView {
    kind: ChannelKind;
    state: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_ATTENTION";
    /** "@chaiandcrumb", or the Page's name. */
    handle: string | null;
    avatarUrl: string | null;
    connectedAt: string | null;
    /** Why it needs reconnecting ("revoked", "expired", "grant-ended") and since when. */
    attention: { reason: string; since: string } | null;
    /** Threads: when Meta's grant ends unless a refresh extends it. */
    grantEndsAt: string | null;
    /** Posts still to go to it (scheduled, or held for a reconnect). */
    waitingPosts: number;
    /** Of those, posts past their time held for a reconnect: "Post them now?". */
    heldPosts: number;
    /** Meta's keys for this login are set here. */
    canConnect: boolean;
}

/** A Page to pick, when a Facebook sign-in manages several. */
export interface PageChoiceView {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export function channelView(
    kind: ChannelKind,
    row: {
        status: "CONNECTED" | "NEEDS_ATTENTION";
        handle: string;
        avatarUrl: string | null;
        connectedAt: Date;
        attentionReason: string | null;
        attentionAt: Date | null;
        grantExpiresAt: Date | null;
    } | null,
    counts: { waiting: number; held: number; canConnect: boolean },
): ChannelView {
    return {
        kind,
        state: row?.status ?? "NOT_CONNECTED",
        handle: row?.handle ?? null,
        avatarUrl: row?.avatarUrl ?? null,
        connectedAt: row?.connectedAt.toISOString() ?? null,
        attention:
            row?.attentionReason && row.attentionAt
                ? {
                      reason: row.attentionReason,
                      since: row.attentionAt.toISOString(),
                  }
                : null,
        grantEndsAt: row?.grantExpiresAt?.toISOString() ?? null,
        waitingPosts: row ? counts.waiting : 0,
        heldPosts: row ? counts.held : 0,
        canConnect: counts.canConnect,
    };
}

export class ChoosePageDto {
    @IsString()
    @MaxLength(64)
    pageId!: string;
}
