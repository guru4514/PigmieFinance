import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth() {
    try {
      return await this.healthService.checkHealth();
    } catch (error: any) {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'Database connection failed',
        details: error.message
      });
    }
  }
}

