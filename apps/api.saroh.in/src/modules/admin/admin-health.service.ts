import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { HealthService } from "../health/health.service";
import { AdminMachineryService } from "./admin-machinery.service";

/** One check's state. `unmeasured` is honest: this instance cannot tell. */
export type CheckState = "ok" | "warn" | "failed" | "unmeasured";

export interface HealthCheck {
    key: string;
    label: string;
    state: CheckState;
    /** The figure or fact behind the state, in words. */
    summary: string;
    /** What to do about it, when there is something to do. */
    action?: { label: string; href: string };
}

const MINUTE = 60;

const NUMBER = new Intl.NumberFormat("en-IN");

/** "1 domain", "3 domains", with thousands separated. */
function count(n: number, one: string, other = `${one}s`): string {
    return `${NUMBER.format(n)} ${n === 1 ? one : other}`;
}

/**
 * The health board (admin console U9, R13) — the screen the console opens on.
 *
 * Every check keeps its place whether green or red, in a fixed order, so an
 * operator's eye learns where to look. Each reads real data or says plainly
 * that it is not measured on this instance (plan D8): storage that is not
 * configured, a version the build does not report and sign-in failures that
 * nothing records render as "not measured here", never as a green tick.
 *
 * One failing check never blanks the board: each is computed on its own, and
 * a check that throws becomes a failed check that says it could not be read.
 */
@Injectable()
export class AdminHealthService {
    constructor(
        private readonly health: HealthService,
        private readonly machinery: AdminMachineryService,
    ) {}

    async board(): Promise<{ checkedAt: Date; checks: HealthCheck[] }> {
        const checks = await Promise.all([
            this.safe("database", "Database and migrations", () =>
                this.database(),
            ),
            this.safe("renewals", "Renewal job", () => this.renewals()),
            this.safe("queue", "Job queue", () => this.queue()),
            this.safe("webhooks", "Webhook deliveries", () => this.webhooks()),
            this.safe("providers", "Providers", () => this.providers()),
            this.safe("storage", "Storage", () =>
                Promise.resolve(this.storage()),
            ),
            this.safe("version", "Version", () => this.version()),
            this.safe("signins", "Failed sign-ins", () =>
                Promise.resolve(this.signIns()),
            ),
        ]);
        return { checkedAt: new Date(), checks };
    }

    private async safe(
        key: string,
        label: string,
        run: () => Promise<Omit<HealthCheck, "key" | "label">>,
    ): Promise<HealthCheck> {
        try {
            return { key, label, ...(await run()) };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "unknown error";
            return {
                key,
                label,
                state: "failed",
                summary: `Could not be read: ${message}`,
            };
        }
    }

    private async database() {
        const report = await this.health.readiness();
        const down = report.checks.filter((check) => check.status === "down");
        if (down.length === 0) {
            const slowest = Math.max(
                ...report.checks.map((check) => check.durationMs),
            );
            return {
                state: "ok" as const,
                summary: `Answering, every migration applied (slowest check ${slowest} ms).`,
            };
        }
        return {
            state: "failed" as const,
            summary: down
                .map((check) => `${check.name}: ${check.detail ?? "down"}`)
                .join("; "),
        };
    }

    private async renewals() {
        const queue = await this.machinery.queue();
        const renewal = queue.renewal;
        const live = await prisma.customerSubscription.count({
            where: { status: { not: "CANCELLED" } },
        });
        if (!renewal) {
            return live === 0
                ? {
                      state: "unmeasured" as const,
                      summary:
                          "No recurring memberships on this instance yet, so no renewal run exists.",
                  }
                : {
                      state: "failed" as const,
                      summary: `No renewal run is scheduled, and ${live} memberships are waiting on one.`,
                      action: {
                          label: "Open the job queue",
                          href: "/operations/jobs?type=subscription.renew",
                      },
                  };
        }
        if (renewal.status === "FAILED") {
            return {
                state: "failed" as const,
                summary: `The last renewal run failed: ${renewal.lastError ?? "no error recorded"}.`,
                action: {
                    label: "Retry it",
                    href: "/operations/jobs?type=subscription.renew&status=FAILED",
                },
            };
        }
        const lateBy = (Date.now() - renewal.runAt.getTime()) / 1000;
        if (renewal.status === "PENDING" && lateBy > 30 * MINUTE) {
            return {
                state: "warn" as const,
                summary: `The next renewal run is ${Math.round(lateBy / MINUTE)} minutes late — is the worker running?`,
                action: {
                    label: "Open the job queue",
                    href: "/operations/jobs",
                },
            };
        }
        return {
            state: "ok" as const,
            summary:
                renewal.status === "PENDING"
                    ? `Next run scheduled; ${count(live, "membership")} renew through it.`
                    : `Running now; ${count(live, "membership")} renew through it.`,
        };
    }

    private async queue() {
        const queue = await this.machinery.queue();
        const lag = queue.oldestDueSeconds;
        const state: CheckState =
            lag > 30 * MINUTE || queue.failedLastDay > 20
                ? "failed"
                : lag > 5 * MINUTE || queue.failedLastDay > 0
                  ? "warn"
                  : "ok";
        const lagText =
            lag === 0
                ? "nothing overdue"
                : `oldest due job waiting ${formatSeconds(lag)}`;
        return {
            state,
            summary: `${NUMBER.format(queue.pending)} waiting, ${lagText}; ${NUMBER.format(queue.doneLastDay)} done and ${NUMBER.format(queue.failedLastDay)} failed in the last day.`,
            ...(queue.failed > 0
                ? {
                      action: {
                          label: `See ${queue.failed} failed`,
                          href: "/operations/jobs?status=FAILED",
                      },
                  }
                : {}),
        };
    }

    private async webhooks() {
        const summary = await this.machinery.webhookSummary();
        const failedDay = summary.lastDay.FAILED ?? 0;
        const receivedDay = Object.values(summary.lastDay).reduce<number>(
            (a, b) => a + (b ?? 0),
            0,
        );
        const failedTotal = summary.total.FAILED ?? 0;
        return {
            state: (failedDay > 0 ? "warn" : "ok") as CheckState,
            summary: `${NUMBER.format(receivedDay)} received in the last day, ${NUMBER.format(failedDay)} failed; ${NUMBER.format(failedTotal)} failed in all.`,
            ...(failedTotal > 0
                ? {
                      action: {
                          label: "See failed deliveries",
                          href: "/operations/webhooks?status=FAILED",
                      },
                  }
                : {}),
        };
    }

    private async providers() {
        const providers = await this.machinery.providers();
        const disabledPayments = providers.payments
            .filter((row) => row.status !== "CONNECTED")
            .reduce((sum, row) => sum + row.count, 0);
        const disabledMessaging = providers.messaging
            .filter((row) => row.status !== "CONNECTED")
            .reduce((sum, row) => sum + row.count, 0);
        const failedDomains =
            providers.domains.find((row) => row.status === "FAILED")?.count ??
            0;
        const waitingDomains =
            providers.domains.find((row) => row.status === "PENDING")?.count ??
            0;
        const problems = disabledPayments + disabledMessaging + failedDomains;
        const parts = [
            `${count(disabledPayments, "payment connection")} and ${count(disabledMessaging, "messaging connection")} off`,
            `${count(waitingDomains, "domain")} waiting on DNS`,
            `${NUMBER.format(failedDomains)} failed`,
        ];
        return {
            state: (problems > 0 ? "warn" : "ok") as CheckState,
            summary: `${parts.join(", ")}.`,
            action: { label: "Open providers", href: "/operations/providers" },
        };
    }

    private storage() {
        const configured = Boolean(env.R2_ENDPOINT && env.R2_BUCKET);
        return configured
            ? {
                  state: "unmeasured" as const,
                  summary: `Uploads go to bucket ${env.R2_BUCKET}. Its free space and reachability are not measured here.`,
              }
            : {
                  state: "unmeasured" as const,
                  summary:
                      "No object storage is configured on this instance, so uploads are off.",
              };
    }

    private async version() {
        const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
            SELECT migration_name FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY migration_name DESC
            LIMIT 1
        `;
        const latest = rows[0]?.migration_name;
        return {
            state: "unmeasured" as const,
            summary: latest
                ? `Schema at ${latest}. This build does not report its own release number.`
                : "No migration has been applied.",
        };
    }

    private signIns() {
        return {
            state: "unmeasured" as const,
            summary:
                "Nothing on this instance records a failed sign-in yet, so this cannot be counted.",
        };
    }
}

function formatSeconds(seconds: number): string {
    if (seconds < MINUTE) return `${seconds} s`;
    if (seconds < 60 * MINUTE) return `${Math.round(seconds / MINUTE)} min`;
    return `${Math.round(seconds / 3600)} h`;
}
