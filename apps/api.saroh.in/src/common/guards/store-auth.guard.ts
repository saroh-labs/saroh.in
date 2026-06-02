import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";

import type { StoreContext } from "../types/store-context";

@Injectable()
export class StoreAccessGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        // Extract storeId from header
        const storeId = request.headers["x-store-id"];
        if (!storeId) {
            throw new ForbiddenException("x-store-id header is required");
        }

        // Verify user exists (set by BetterAuthGuard)
        if (!request.user) {
            throw new ForbiddenException("User context not available");
        }

        // Set store context on request. role/permissions arrive with the M2
        // admin/organization plugins; default to a plain customer until then.
        const storeContext: StoreContext = {
            storeId: storeId as string,
            userId: request.user.id,
            role: request.user.role || "customer",
            permissions: request.user.permissions || [],
        };

        request.storeContext = storeContext;
        return true;
    }
}
