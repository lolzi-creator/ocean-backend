import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from './multer.config';
import { VehiclesService } from './vehicles.service';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Get('decode/:vin')
  decodeVin(@Param('vin') vin: string) {
    return this.vehiclesService.decodeVin(vin);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createVehicleDto: {
      vin: string;
      brand?: string;
      model?: string;
      year?: number;
      trim?: string;
      style?: string;
      bodyType?: string;
      engine?: string;
      transmission?: string;
      drive?: string;
      manufacturer?: string;
      origin?: string;
      licensePlate?: string;
      workDescription?: string;
      serviceType?: string;
      color?: string;
      mileage?: number;
      photoUrl?: string;
      documentPhotoUrl?: string;
    },
  ) {
    return this.vehiclesService.create(createVehicleDto, user.id);
  }

  @Post(':id/upload-photo')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadPhoto(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: 'vehicle' | 'document',
  ) {
    const photoUrl = await this.uploadService.uploadPhoto(file, id, type);
    
    if (type === 'vehicle') {
      return this.vehiclesService.update(id, { photoUrl }, user.id);
    } else {
      return this.vehiclesService.update(id, { documentPhotoUrl: photoUrl }, user.id);
    }
  }

  @Post('extract-vin')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async extractVinFromPhoto(@UploadedFile() file: Express.Multer.File) {
    // TODO: Implement OCR to extract VIN from photo
    // For now, return empty - user can manually enter VIN
    return { vin: '', extractedText: '' };
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    updateVehicleDto: {
      brand?: string;
      model?: string;
      year?: number;
      trim?: string;
      style?: string;
      bodyType?: string;
      engine?: string;
      transmission?: string;
      drive?: string;
      manufacturer?: string;
      origin?: string;
      licensePlate?: string;
      workDescription?: string;
      serviceType?: string;
      color?: string;
      mileage?: number;
      photoUrl?: string;
      documentPhotoUrl?: string;
      isActive?: boolean;
    },
  ) {
    return this.vehiclesService.update(id, updateVehicleDto, user.id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.vehiclesService.remove(id, user.id);
  }

  @Post(':id/create-estimate')
  createEstimate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    createEstimateDto: {
      customerName: string;
      customerEmail?: string;
      customerAddress?: string;
    },
  ) {
    return this.vehiclesService.createEstimateFromVehicle(
      id,
      createEstimateDto.customerName,
      user.id,
      createEstimateDto.customerEmail,
      createEstimateDto.customerAddress,
    );
  }

  @Post(':id/create-invoice')
  createInvoice(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    createInvoiceDto: {
      customerName: string;
      customerEmail?: string;
      customerAddress?: string;
      confirmedHours?: number;
    },
  ) {
    return this.vehiclesService.createInvoiceFromVehicle(
      id,
      createInvoiceDto.customerName,
      user.id,
      createInvoiceDto.customerEmail,
      createInvoiceDto.customerAddress,
    );
  }
}
