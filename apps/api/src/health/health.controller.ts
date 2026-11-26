import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator.js";
import { HealthService } from "./health.service.js";

@Public()
@Controller("health")
export class HealthController {
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
