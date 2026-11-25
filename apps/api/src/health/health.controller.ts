import { Controller, Get, Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async isDatabaseReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

@Controller("health")
class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    const ready = await this.health.isDatabaseReady();
    return {
      status: ready ? "ok" : "degraded",
      database: ready ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
