import { IsBoolean, IsIn } from "class-validator";

import type { AlertChannel, AlertEvent } from "./alert-preferences";
import { ALERT_CHANNELS, ALERT_EVENTS } from "./alert-preferences";

/** `PATCH /organizations/:id/me/alerts`: one switch, on or off (F14). */
export class UpdateAlertDto {
    @IsIn(ALERT_EVENTS, { message: "Unknown alert" })
    alert!: AlertEvent;

    @IsIn(ALERT_CHANNELS, { message: "Unknown channel" })
    channel!: AlertChannel;

    @IsBoolean()
    on!: boolean;
}
