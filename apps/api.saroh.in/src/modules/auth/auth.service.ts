import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { JwtPayload } from "../../common/types/store-context";

@Injectable()
export class AuthService {
    constructor(private readonly jwtService: JwtService) {}

    async generateTokens(payload: Partial<JwtPayload>) {
        const accessToken = await this.jwtService.signAsync(
            {
                sub: payload.sub,
                email: payload.email,
                storeId: payload.storeId,
                role: payload.role,
                permissions: payload.permissions || [],
            },
            {
                expiresIn: "24h",
            },
        );

        const refreshToken = await this.jwtService.signAsync(
            {
                sub: payload.sub,
                email: payload.email,
            },
            {
                expiresIn: "7d",
            },
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: 86400, // 24 hours in seconds
        };
    }

    async validateToken(token: string): Promise<JwtPayload | null> {
        try {
            return await this.jwtService.verifyAsync<JwtPayload>(token);
        } catch {
            return null;
        }
    }
}
