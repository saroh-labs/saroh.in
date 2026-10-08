"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";
import type { DeployApp, DeployEnvironment } from "./deployments";

/**
 * Start one app's deploy in one environment (#886). The API checks the
 * permission, the typed name for production and the rate limit, and
 * records the start; this only forwards.
 */
export async function startDeploymentAction(input: {
    app: DeployApp;
    environment: DeployEnvironment;
    confirm?: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<{ workflowUrl: string }>> {
    const result = await adminWrite<{ workflowUrl: string }>(
        "/deployments",
        "POST",
        input,
        "Could not start the deploy. Nothing was deployed.",
    );
    if (result.ok) revalidatePath("/deployments");
    return result;
}
