import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.invoicesService.findAll({ vehicleId, type, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createInvoiceDto: {
      type: string;
      customerName: string;
      customerEmail?: string;
      customerAddress?: string;
      items: any[];
      taxRate?: number;
      notes?: string;
      vehicleId: string;
    },
  ) {
    return this.invoicesService.create(createInvoiceDto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateInvoiceDto: {
      status?: string;
      customerName?: string;
      customerEmail?: string;
      customerAddress?: string;
      items?: any[];
      taxRate?: number;
      notes?: string;
    },
  ) {
    return this.invoicesService.update(id, updateInvoiceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoicesService.remove(id);
  }
}
