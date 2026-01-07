import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { TimeLogsService } from './time-logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('time-logs')
@UseGuards(JwtAuthGuard)
export class TimeLogsController {
  constructor(private readonly timeLogsService: TimeLogsService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = { userId, vehicleId };
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    return this.timeLogsService.findAll(filters);
  }

  @Get('total/hours')
  getTotalHours(
    @Query('userId') userId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = { userId, vehicleId };
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    return this.timeLogsService.getTotalHours(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeLogsService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createTimeLogDto: {
      hours?: number;
      notes?: string;
      vehicleId: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const payload: any = {
      ...createTimeLogDto,
      startTime: createTimeLogDto.startTime ? new Date(createTimeLogDto.startTime) : undefined,
      endTime: createTimeLogDto.endTime ? new Date(createTimeLogDto.endTime) : undefined,
    };
    return this.timeLogsService.create(payload, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateTimeLogDto: {
      hours?: number;
      notes?: string;
      startTime?: string;
      endTime?: string;
    },
  ) {
    const payload: any = {
      ...updateTimeLogDto,
      startTime: updateTimeLogDto.startTime ? new Date(updateTimeLogDto.startTime) : undefined,
      endTime: updateTimeLogDto.endTime ? new Date(updateTimeLogDto.endTime) : undefined,
    };
    return this.timeLogsService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.timeLogsService.remove(id);
  }
}
