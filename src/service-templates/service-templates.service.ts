import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface ServiceTemplatePart {
  partCode: string;
  name: string;
  functionalGroup?: string;
  quantity: number;
}

@Injectable()
export class ServiceTemplatesService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      name: string;
      description?: string;
      estimatedHours?: number;
      parts: ServiceTemplatePart[];
    },
    userId: string,
  ) {
    return this.prisma.serviceTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        estimatedHours: data.estimatedHours || 1,
        parts: data.parts as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.serviceTemplate.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.serviceTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!template) {
      throw new NotFoundException(`Service-Vorlage mit ID ${id} nicht gefunden`);
    }

    return template;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      estimatedHours?: number;
      parts?: ServiceTemplatePart[];
      isActive?: boolean;
    },
  ) {
    await this.findOne(id);

    return this.prisma.serviceTemplate.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        estimatedHours: data.estimatedHours,
        parts: data.parts as unknown as Prisma.InputJsonValue,
        isActive: data.isActive,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.serviceTemplate.delete({
      where: { id },
    });
  }

  // Get the part codes for a service template (to use with Derendinger API)
  async getPartCodes(id: string) {
    const template = await this.findOne(id);
    const parts = (template.parts as unknown as ServiceTemplatePart[]) || [];
    
    return parts.map((part) => ({
      partCode: part.partCode,
      functionalGroup: part.functionalGroup,
      name: part.name,
    }));
  }
}
