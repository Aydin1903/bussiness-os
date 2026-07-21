import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@business-os/contracts';
import type { Response } from 'express';

import { HealthService } from './health.service';

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;

@ApiTags('Platform')
@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  /**
   * Kritik bir bagimlilik erisilemezse 503 doner.
   *
   * Durum kodu orchestrator icin sozlesmenin kendisidir: govdeyi okumaz,
   * koda bakar. 200 donen "down" bir cevap, cokmus bir instance'a trafik
   * yonlendirilmesine yol acar.
   */
  @Get()
  @ApiOperation({
    summary: 'Servis ve bagimlilik saglik durumu',
    description:
      'Orchestrator sozlesmesidir: kimlik dogrulamasi gerektirmez, yan etkisizdir ' +
      've tenant baglamindan bagimsizdir.',
  })
  @ApiResponse({ status: HTTP_OK, description: 'Servis saglikli (ok veya degraded).' })
  @ApiResponse({ status: HTTP_SERVICE_UNAVAILABLE, description: 'Kritik bagimlilik erisilemez.' })
  public async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.healthService.check();

    response.status(result.status === 'down' ? HTTP_SERVICE_UNAVAILABLE : HTTP_OK);

    return result;
  }
}
