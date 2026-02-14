import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";

import { AuthService } from "./auth.service";

class SignupDto {
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    @IsString()
    name!: string;
}

class LoginDto {
    @IsEmail()
    email!: string;

    @IsString()
    password!: string;
}

class RefreshTokenDto {
    @IsString()
    refreshToken!: string;
}

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post("signup")
    @HttpCode(201)
    async signup(@Body() dto: SignupDto) {
        // TODO: Implement signup logic
        // 1. Validate email doesn't exist
        // 2. Hash password
        // 3. Create user in database
        // 4. Generate tokens

        return {
            message: "Signup functionality to be implemented",
            email: dto.email,
        };
    }

    @Post("login")
    @HttpCode(200)
    async login(@Body() dto: LoginDto) {
        // TODO: Implement login logic
        // 1. Find user by email
        // 2. Verify password
        // 3. Generate tokens

        return {
            message: "Login functionality to be implemented",
            email: dto.email,
        };
    }

    @Post("refresh")
    @HttpCode(200)
    async refresh(@Body() dto: RefreshTokenDto) {
        // TODO: Implement token refresh logic
        // 1. Validate refresh token
        // 2. Generate new access token

        const refreshToken = dto.refreshToken;
        const payload = await this.authService.validateToken(refreshToken);

        if (!payload) {
            return {
                statusCode: 401,
                message: "Invalid refresh token",
            };
        }

        const tokens = await this.authService.generateTokens({
            sub: payload.sub,
            email: payload.email,
        });

        return tokens;
    }
}
