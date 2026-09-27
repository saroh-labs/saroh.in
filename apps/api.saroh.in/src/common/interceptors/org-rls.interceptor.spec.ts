import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { currentOrgContext } from "@saroh/database";
import { firstValueFrom, Observable } from "rxjs";

import { OrgRlsInterceptor } from "./org-rls.interceptor";

/**
 * Which organization a request's queries run under (S1-011; round-2 plan A,
 * A3). The handler runs on subscription, so what it sees is read inside the
 * downstream Observable, as a real handler would.
 */
function contextFor(request: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

const seesContext: CallHandler = {
    handle: () =>
        new Observable<string | undefined>((subscriber) => {
            // Async, like a handler awaiting a query.
            void Promise.resolve().then(() => {
                subscriber.next(currentOrgContext());
                subscriber.complete();
            });
        }),
};

function run(request: Record<string, unknown>) {
    return firstValueFrom(
        new OrgRlsInterceptor().intercept(contextFor(request), seesContext),
    );
}

describe("OrgRlsInterceptor", () => {
    it("runs a staff route in its organization", async () => {
        await expect(
            run({ organizationContext: { organizationId: "org_staff" } }),
        ).resolves.toBe("org_staff");
    });

    it("runs a customer route in the business the session belongs to", async () => {
        await expect(
            run({ customerContext: { organizationId: "org_customer" } }),
        ).resolves.toBe("org_customer");
    });

    it("prefers the staff context when both are somehow present", async () => {
        await expect(
            run({
                organizationContext: { organizationId: "org_staff" },
                customerContext: { organizationId: "org_customer" },
            }),
        ).resolves.toBe("org_staff");
    });

    it("leaves a public route with no context", async () => {
        await expect(run({})).resolves.toBeUndefined();
    });
});
