import { Injectable } from "@nestjs/common";

import type { OrganizationContext } from "../../../common/types/organization-context";

interface Running {
    controller: AbortController;
    organizationId: string;
    userId: string;
}

/**
 * The turns running in this process, by turn id, so Stop can abort one
 * (DEC-220). shortcut: in memory, which assumes one API replica; with a
 * second, Stop reaching the other replica finds nothing and the turn runs
 * to its end. Move it to Redis pub/sub (`LimitsService`'s client) the day
 * the API runs two replicas (devops-observability.md, "State in one
 * process").
 */
@Injectable()
export class TurnRegistry {
    private readonly running = new Map<string, Running>();

    /** A signal for a new turn; call {@link end} when it finishes. */
    begin(ctx: OrganizationContext, turnId: string): AbortSignal {
        const controller = new AbortController();
        this.running.set(turnId, {
            controller,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
        });
        return controller.signal;
    }

    end(turnId: string): void {
        this.running.delete(turnId);
    }

    /** Stops the asker's own turn; false when there is none to stop here. */
    stop(ctx: OrganizationContext, turnId: string): boolean {
        const turn = this.running.get(turnId);
        if (
            turn?.organizationId !== ctx.organizationId ||
            turn.userId !== ctx.userId
        ) {
            return false;
        }
        turn.controller.abort();
        return true;
    }
}
