import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ServiceTemplatesService, ServiceTemplatePart } from './service-templates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('service-templates')
@UseGuards(JwtAuthGuard)
export class ServiceTemplatesController {
  constructor(private readonly serviceTemplatesService: ServiceTemplatesService) {}

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createDto: {
      name: string;
      description?: string;
      estimatedHours?: number;
      parts: ServiceTemplatePart[];
    },
  ) {
    return this.serviceTemplatesService.create(createDto, user.id);
  }

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.serviceTemplatesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceTemplatesService.findOne(id);
  }

  @Get(':id/part-codes')
  getPartCodes(@Param('id') id: string) {
    return this.serviceTemplatesService.getPartCodes(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateDto: {
      name?: string;
      description?: string;
      estimatedHours?: number;
      parts?: ServiceTemplatePart[];
      isActive?: boolean;
    },
  ) {
    return this.serviceTemplatesService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serviceTemplatesService.remove(id);
  }
}
