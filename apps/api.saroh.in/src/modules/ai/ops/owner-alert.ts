import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendAiOwnerAlertEmail } from "../../../common/email";
import { AdminRole } from "../../admin/admin-permissions";

/** An alarm as emailed: Saroh's words and numbers, never a question or an answer. */
export interface OwnerAlert {
    subject: string;
    lines: string[];
}

/**
 * Emails an Ask AI alarm to every active Platform owner (DEC-220, U8).
 * Never throws: an alarm that can't be sent is logged by staff id and
 * outcome, and the alarm's own record still stands.
 */
@Injectable()
export class OwnerAlertSender {
    private readonly logger = new Logger(OwnerAlertSender.name);

    async send(alert: OwnerAlert, now: Date = new Date()): Promise<number> {
        let sent = 0;
        try {
            const owners = await prisma.platformAdmin.findMany({
                where: {
                    revokedAt: null,
                    roleAssignments: {
                        some: {
                            role: AdminRole.PlatformOwner,
                            revokedAt: null,
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gt: now } },
                            ],
                        },
                    },
                },
                select: {
                    id: true,
                    user: { select: { email: true, name: true } },
                },
            });
            for (const owner of owners) {
                const outcome = await sendAiOwnerAlertEmail(owner.user, alert);
                if (outcome === "sent") sent += 1;
                else {
                    this.logger.warn(
                        `ai_owner_alert email ${outcome} for platformAdmin=${owner.id}`,
                    );
                }
            }
        } catch (error) {
            this.logger.error(
                `ai_owner_alert failed: ${error instanceof Error ? error.name : "unknown"}`,
            );
        }
        return sent;
    }
}
