"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { startDeploymentAction } from "@/lib/deployment-actions";
import type { DeployApp, DeployEnvironment } from "@/lib/deployments";

const STARTED = "Started. The run shows here in a few seconds.";

/**
 * Deploy one app in one environment (#886). Dev deploys at once; production
 * opens a confirmation that names the app and asks for its Worker's name,
 * which the API checks too. Each press carries its own idempotency key, so a
 * double click starts one run.
 */
export function DeployButton({
    app,
    label,
    environment,
    worker,
    disabled = false,
}: {
    app: DeployApp;
    label: string;
    environment: DeployEnvironment;
    worker: string;
    disabled?: boolean;
}) {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const status = message && (
        <span role="status" className="text-[13px] text-muted-foreground">
            {message}
        </span>
    );

    if (environment === "production") {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <OperatorDialog
                    trigger="Deploy"
                    title={`Deploy ${label} to production`}
                    effect={
                        <p>
                            Builds {label} from <code>main</code> and replaces
                            what is live on <code>{worker}</code>, even if
                            nothing changed. Customers get the new build as soon
                            as it finishes.
                        </p>
                    }
                    confirmName={worker}
                    reasonRequired={false}
                    submitLabel="Deploy to production"
                    disabled={disabled}
                    onSubmit={async ({ idempotencyKey, values }) => {
                        setMessage(null);
                        const result = await startDeploymentAction({
                            app,
                            environment,
                            confirm: values.confirmName,
                            idempotencyKey,
                        });
                        if (!result.ok) {
                            return { ok: false, error: result.error };
                        }
                        setMessage(STARTED);
                        router.refresh();
                        return { ok: true };
                    }}
                />
                {status}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || pending}
                onClick={() =>
                    startTransition(async () => {
                        setMessage(null);
                        const result = await startDeploymentAction({
                            app,
                            environment,
                            idempotencyKey: crypto.randomUUID(),
                        });
                        setMessage(result.ok ? STARTED : result.error);
                        if (result.ok) router.refresh();
                    })
                }
            >
                {pending ? "Starting…" : "Deploy"}
            </Button>
            {status}
        </div>
    );
}
