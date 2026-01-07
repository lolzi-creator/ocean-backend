import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (status) filters.status = status;
    if (vehicleId) filters.vehicleId = vehicleId;

    return this.appointmentsService.findAll(filters);
  }

  @Get('availability')
  async checkAvailability(@Query('date') date: string) {
    const isAvailable = await this.appointmentsService.checkAvailability(new Date(date));
    return { available: isAvailable };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createAppointmentDto: {
      date: string;
      customerName: string;
      customerPhone?: string;
      customerEmail?: string;
      serviceType: string;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    return this.appointmentsService.create(
      {
        ...createAppointmentDto,
        date: new Date(createAppointmentDto.date),
      },
      user.id,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateAppointmentDto: {
      date?: string;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      serviceType?: string;
      status?: string;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    const data: any = { ...updateAppointmentDto };
    if (updateAppointmentDto.date) {
      data.date = new Date(updateAppointmentDto.date);
    }

    return this.appointmentsService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}



