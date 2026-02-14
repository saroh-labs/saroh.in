export interface StoreContext {
    storeId: string;
    userId: string;
    role: "owner" | "admin" | "staff" | "customer";
    permissions: string[];
}

export interface JwtPayload {
    sub: string; // userId
    email: string;
    storeId?: string;
    role?: string;
    permissions?: string[];
    iat?: number;
    exp?: number;
}
