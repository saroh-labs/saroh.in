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

        // Verify user exists (set by AuthGuard)
        if (!request.user) {
            throw new ForbiddenException("User context not available");
        }

        // Set store context on request
        const storeContext: StoreContext = {
            storeId: storeId as string,
            userId: request.user.sub,
            role: request.user.role || "customer",
            permissions: request.user.permissions || [],
        };

        request.storeContext = storeContext;
        return true;
    }
}
