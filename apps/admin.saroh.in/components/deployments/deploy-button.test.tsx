/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startDeploymentAction = vi.fn();
vi.mock("@/lib/deployment-actions", () => ({
    startDeploymentAction: (...args: unknown[]) =>
        startDeploymentAction(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DeployButton } from "./deploy-button";

describe("DeployButton (#886)", () => {
    beforeEach(() => {
        startDeploymentAction
            .mockReset()
            .mockResolvedValue({ ok: true, data: { workflowUrl: "x" } });
        refresh.mockReset();
    });

    it("deploys to dev at once, with a fresh key, and says it started", async () => {
        render(
            <DeployButton
                app="admin"
                label="Admin"
                environment="development"
                worker="saroh-admin-dev"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
        await waitFor(() =>
            expect(startDeploymentAction).toHaveBeenCalledWith({
                app: "admin",
                environment: "development",
                idempotencyKey: expect.any(String) as unknown,
            }),
        );
        expect(await screen.findByRole("status")).toBeTruthy();
        expect(refresh).toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows the API's refusal in place", async () => {
        startDeploymentAction.mockResolvedValue({
            ok: false,
            error: "Admin was just deployed to development.",
        });
        render(
            <DeployButton
                app="admin"
                label="Admin"
                environment="development"
                worker="saroh-admin-dev"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
        expect((await screen.findByRole("status")).textContent).toContain(
            "just deployed",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("asks for the Worker's name before a production deploy", async () => {
        render(
            <DeployButton
                app="web"
                label="Marketing site"
                environment="production"
                worker="saroh-web"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
        expect(startDeploymentAction).not.toHaveBeenCalled();
        expect(
            screen.getByRole("heading", {
                name: "Deploy Marketing site to production",
            }),
        ).toBeTruthy();

        const submit = screen.getByRole<HTMLButtonElement>("button", {
            name: "Deploy to production",
        });
        expect(submit.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText(/to confirm/), {
            target: { value: "saroh-web" },
        });
        expect(submit.disabled).toBe(false);
        fireEvent.click(submit);
        await waitFor(() =>
            expect(startDeploymentAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    app: "web",
                    environment: "production",
                    confirm: "saroh-web",
                }),
            ),
        );
    });
});
