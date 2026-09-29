/**
 * `payments reconcile` (P1, issue #710): ask the provider about every open
 * payment intent of one business and settle the ones it has the money
 * for — a booking left "Awaiting payment" because its webhook never came.
 *
 *     node apps/api.saroh.in/dist/cli/payments-reconcile.cli.js <organization id or slug>
 *
 * Run it inside the API's own container (it reads the same environment:
 * the database, and the key that opens the business's provider
 * credentials). It settles through the webhook's own reconciliation, so
 * it is safe to run more than once and beside live webhooks: a second run
 * asks only about what is still open. It prints counts, nothing else —
 * never a credential, a customer or an amount. Exit 1 when a provider
 * could not answer for some intent; run it again later.
 *
 * Built by hand rather than booting the app, so no job worker starts.
 */
import { prisma } from "@saroh/database";

import { PaymentsService } from "../modules/payments/payments.service";
import { DefaultProviderFactory } from "../modules/payments/providers/provider.factory";
import type { LookupCounts } from "../modules/webhooks/payment-lookup.service";
import { PaymentLookupService } from "../modules/webhooks/payment-lookup.service";
import { DefaultWebhookProviderFactory } from "../modules/webhooks/providers/webhook-provider.factory";
import { WebhooksService } from "../modules/webhooks/webhooks.service";

const TAG = "[payments-reconcile]";

/** The counts line the rollout doc shows. */
export function formatCounts(counts: LookupCounts): string {
    return [
        `open intents asked: ${counts.looked}`,
        `settled: ${counts.SETTLED}`,
        `already settled: ${counts.ALREADY_SETTLED}`,
        `not paid: ${counts.NOT_PAID}`,
        `amount mismatch: ${counts.MISMATCH}`,
        `no connection: ${counts.UNAVAILABLE}`,
        `provider errors: ${counts.ERROR}`,
    ].join(", ");
}

async function main(argv: string[]): Promise<number> {
    const target = argv[0]?.trim();
    if (!target) {
        console.error(
            `${TAG} usage: payments-reconcile <organization id or slug>`,
        );
        return 2;
    }
    const organization = await prisma.organization.findFirst({
        where: { OR: [{ id: target }, { slug: target }] },
        select: { id: true },
    });
    if (!organization) {
        console.error(`${TAG} no business with that id or slug`);
        return 2;
    }

    const providers = new DefaultProviderFactory();
    const lookup = new PaymentLookupService(
        providers,
        new WebhooksService(
            new DefaultWebhookProviderFactory(),
            new PaymentsService(providers),
        ),
    );
    const counts = await lookup.reconcileOrganization(organization.id);
    console.info(`${TAG} ${formatCounts(counts)}`);
    return counts.ERROR > 0 ? 1 : 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            console.error(
                `${TAG} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            process.exitCode = 1;
        })
        .finally(() => {
            void prisma.$disconnect();
        });
}
