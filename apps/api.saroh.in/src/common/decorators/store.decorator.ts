import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type { StoreContext } from "../types/store-context";

export const Store = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): StoreContext => {
        const request = ctx.switchToHttp().getRequest();
        return request.storeContext;
    },
);
