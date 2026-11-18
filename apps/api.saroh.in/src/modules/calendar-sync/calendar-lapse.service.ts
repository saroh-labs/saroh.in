import { Injectable } from "@nestjs/common";

import { markLapsed } from "./calendar-access";

/**
 * Google refused a connection's token (`invalid_grant`): the connection is
 * LAPSED until the person connects again, and syncing stops for it. Every
 * path that meets the refusal comes here.
 */
@Injectable()
export class CalendarLapseService {
    async lapse(
        connectionId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        return markLapsed(connectionId, now);
    }
}
