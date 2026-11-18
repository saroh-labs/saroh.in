import { prisma } from "@saroh/database";

import type { GoogleCalendarPort } from "./google/google-calendar.port";
import {
    GoogleCalendarError,
    isGoogleError,
} from "./google/google-calendar.port";
import { openToken, sealedToken } from "./sealing";

/**
 * A connection's access to Google, for one job or one request: the sealed
 * refresh token opened in memory and traded for an access token, never
 * stored. When Google refuses the refresh token the connection is marked
 * LAPSED (`onLapse` tells the person, U7) and the `lapsed` error goes on
 * to the caller, which stops.
 */

export interface SealedConnection {
    id: string;
    organizationId: string;
    status: string;
    tokenCiphertext: string | null;
    tokenIv: string | null;
    tokenAuthTag: string | null;
}

export const SEALED_CONNECTION = {
    id: true,
    organizationId: true,
    status: true,
    tokenCiphertext: true,
    tokenIv: true,
    tokenAuthTag: true,
} as const;

/** What Google refused, kept on the row in words: never a token or an email. */
export const LAPSED_ERROR = "Google refused Saroh's access: reconnect";

export async function accessTokenFor(
    google: GoogleCalendarPort,
    connection: SealedConnection,
    onLapse: (connectionId: string) => Promise<unknown>,
): Promise<string> {
    const sealed = sealedToken(connection);
    if (connection.status !== "CONNECTED" || !sealed) {
        throw new GoogleCalendarError("lapsed", "connection is not connected");
    }
    const refreshToken = openToken(sealed, {
        organizationId: connection.organizationId,
        connectionId: connection.id,
    });
    try {
        return await google.refresh(refreshToken);
    } catch (error) {
        if (isGoogleError(error, "lapsed")) await onLapse(connection.id);
        throw error;
    }
}

/**
 * CONNECTED → LAPSED, once: the token is dropped (it is no use now) and the
 * person's choices stay for the reconnect. True only for the write that
 * made the change, so whoever wins tells the person, once (U7).
 */
export async function markLapsed(
    connectionId: string,
    now: Date = new Date(),
): Promise<boolean> {
    const { count } = await prisma.googleCalendarConnection.updateMany({
        where: { id: connectionId, status: "CONNECTED" },
        data: {
            status: "LAPSED",
            lapsedAt: now,
            lastError: LAPSED_ERROR,
            tokenCiphertext: null,
            tokenIv: null,
            tokenAuthTag: null,
        },
    });
    return count === 1;
}
