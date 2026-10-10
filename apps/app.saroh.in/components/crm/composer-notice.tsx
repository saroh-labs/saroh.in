import type { ComposerGate } from "@/lib/messages/composer-gate";
import {
    ModuleOffState,
    PlanLockedState,
    ProviderDisconnectedState,
} from "@saroh/ui/data-state";

/**
 * What the lead's "Send a message" shows in place of the composer when it
 * can't send (`composerGate`, UX-067): connect a provider where the plan has
 * room, the plan that has it where it hasn't, or — Communications off — a
 * quiet line for someone who may turn it on, and nothing for anyone else.
 * Nothing for `compose`: the composer is shown.
 */
export function ComposerNotice({ gate }: { gate: ComposerGate }) {
    if (gate.kind === "compose") return null;
    if (gate.kind === "off") {
        if (!gate.canManage) return null;
        return (
            <ModuleOffState
                size="inline"
                name="Messaging"
                description={null}
                canTurnOn
            />
        );
    }
    return gate.kind === "plan" ? (
        <PlanLockedState
            size="inline"
            name="Sending from here"
            title={gate.title}
            description={null}
            plan={gate.plan}
            href={gate.href}
            canChangePlan
        />
    ) : (
        <ProviderDisconnectedState
            size="inline"
            provider="email"
            title={gate.title}
            href={gate.href}
        />
    );
}
