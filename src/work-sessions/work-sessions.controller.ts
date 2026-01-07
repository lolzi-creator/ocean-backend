import { Controller, Get, Post, UseGuards, Query, Body } from '@nestjs/common';
import { WorkSessionsService } from './work-sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('work-sessions')
@UseGuards(JwtAuthGuard)
export class WorkSessionsController {
  constructor(private readonly workSessionsService: WorkSessionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    const filters: any = {};
    
    // If user is not admin, only show their own sessions
    if (user.role !== 'admin') {
      filters.userId = user.id;
    } else if (userId) {
      filters.userId = userId;
    }

    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.workSessionsService.findAll(filters);
  }

  @Get('active')
  async getActiveSession(@CurrentUser() user: any) {
    return this.workSessionsService.findActiveSession(user.id);
  }

  @Get('total-hours')
  async getTotalHours(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    const targetUserId = user.role === 'admin' && userId ? userId : user.id;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const totalHours = await this.workSessionsService.getTotalHours(targetUserId, start, end);
    return { totalHours };
  }

  @Post('check-in')
  async checkIn(@CurrentUser() user: any) {
    return this.workSessionsService.checkIn(user.id);
  }

  @Post('check-out')
  async checkOut(@CurrentUser() user: any) {
    return this.workSessionsService.checkOut(user.id);
  }

  @Post('manual')
  async createManual(
    @CurrentUser() user: any,
    @Body() body: { checkIn: string; checkOut: string },
  ) {
    return this.workSessionsService.createManual(
      user.id,
      new Date(body.checkIn),
      new Date(body.checkOut),
    );
  }
}

