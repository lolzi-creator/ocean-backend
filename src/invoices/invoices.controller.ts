import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadService } from '../vehicles/upload.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly uploadService: UploadService,
  ) {}

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

  @Post(':id/upload-pdf')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPDF(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file || file.mimetype !== 'application/pdf') {
      throw new Error('Nur PDF-Dateien sind erlaubt');
    }

    // Get invoice to find vehicleId
    const invoice = await this.invoicesService.findOne(id);
    const vehicleId = invoice.vehicleId;

    // Upload PDF to Supabase Storage
    const pdfUrl = await this.uploadService.uploadPDF(
      file.buffer,
      vehicleId,
      `${invoice.invoiceNumber}.pdf`,
    );

    // Update invoice with PDF URL
    await this.invoicesService.updatePdfUrl(id, pdfUrl);

    return { pdfUrl };
  }
}
