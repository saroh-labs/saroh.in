import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";

import { Store } from "../../common/decorators/store.decorator";
import { AuthGuard } from "../../common/guards/auth.guard";
import { StoreAccessGuard } from "../../common/guards/store-auth.guard";
import type { StoreContext } from "../../common/types/store-context";
import { StoresService } from "./stores.service";

class CreateStoreDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;
}

class UpdateStoreDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;
}

@Controller("stores")
export class StoresController {
    constructor(private readonly storesService: StoresService) {}

    @Get(":id")
    @UseGuards(AuthGuard, StoreAccessGuard)
    async getStore(
        @Param("id") id: string,
        @Store() storeContext: StoreContext,
    ) {
        // Verify user has access to this store
        if (storeContext.storeId !== id) {
            return {
                statusCode: 403,
                message: "Access denied to this store",
            };
        }

        return this.storesService.getStoreById(id);
    }

    @Get()
    @UseGuards(AuthGuard)
    async getStores() {
        // TODO: Extract userId from request or JWT payload
        return this.storesService.getStoresByUser("user-id");
    }

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(201)
    async createStore(@Body() createStoreDto: CreateStoreDto) {
        // TODO: Extract userId from JWT payload
        return this.storesService.createStore("user-id", createStoreDto);
    }

    @Put(":id")
    @UseGuards(AuthGuard, StoreAccessGuard)
    async updateStore(
        @Param("id") id: string,
        @Body() updateStoreDto: UpdateStoreDto,
        @Store() storeContext: StoreContext,
    ) {
        // Verify user has access to this store
        if (storeContext.storeId !== id) {
            return {
                statusCode: 403,
                message: "Access denied to this store",
            };
        }

        return this.storesService.updateStore(id, updateStoreDto);
    }

    @Delete(":id")
    @UseGuards(AuthGuard, StoreAccessGuard)
    @HttpCode(204)
    async deleteStore(
        @Param("id") id: string,
        @Store() storeContext: StoreContext,
    ) {
        // Verify user has access to this store
        if (storeContext.storeId !== id) {
            return {
                statusCode: 403,
                message: "Access denied to this store",
            };
        }

        await this.storesService.deleteStore(id);
        return null;
    }
}
