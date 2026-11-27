import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetsController } from "./assets.controller.js";
import { AssetStorageService, UPLOAD_DIR } from "./asset-storage.service.js";

@Module({
  controllers: [AssetsController],
  providers: [
    AssetStorageService,
    {
      provide: UPLOAD_DIR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): string => config.getOrThrow<string>("UPLOAD_DIR"),
    },
  ],
})
export class AssetsModule {}
