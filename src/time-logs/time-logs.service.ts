import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimeLogsService {
  constructor(private prisma: PrismaService) {}

  private computeHours(startTime?: Date, endTime?: Date, hours?: number) {
    if (startTime && endTime) {
      const diffMs = endTime.getTime() - startTime.getTime();
      if (diffMs <= 0) {
        throw new BadRequestException('Endzeit muss nach der Startzeit liegen');
      }
      return Math.round((diffMs / 1000 / 60 / 60) * 100) / 100; // round to 2 decimals
    }
    if (hours === undefined || hours === null) {
      throw new BadRequestException('Bitte Start- und Endzeit oder Stunden angeben');
    }
    return hours;
  }

  async create(
    data: { hours?: number; notes?: string; vehicleId: string; startTime?: Date; endTime?: Date },
    userId: string,
  ) {
    const hours = this.computeHours(data.startTime, data.endTime, data.hours);

    return this.prisma.timeLog.create({
      data: {
        hours,
        notes: data.notes,
        userId,
        vehicleId: data.vehicleId,
        startTime: data.startTime,
        endTime: data.endTime,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, vin: true, brand: true, model: true, workDescription: true } },
      },
    });
  }

  async findAll(filters?: { userId?: string; vehicleId?: string; startDate?: Date; endDate?: Date }) {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.vehicleId) where.vehicleId = filters.vehicleId;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return this.prisma.timeLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, vin: true, brand: true, model: true, workDescription: true } },
      },
      orderBy: [
        { startTime: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getTotalHours(filters?: { userId?: string; vehicleId?: string; startDate?: Date; endDate?: Date }) {
    const where: any = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.vehicleId) where.vehicleId = filters.vehicleId;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const result = await this.prisma.timeLog.aggregate({
      where,
      _sum: {
        hours: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalHours: result._sum.hours || 0,
      totalEntries: result._count.id || 0,
    };
  }

  async findOne(id: string) {
    const timeLog = await this.prisma.timeLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, vin: true, brand: true, model: true, workDescription: true } },
      },
    });
    if (!timeLog) {
      throw new NotFoundException(`Zeiteintrag mit ID ${id} nicht gefunden`);
    }
    return timeLog;
  }

  async update(id: string, data: { hours?: number; notes?: string; startTime?: Date; endTime?: Date }) {
    await this.findOne(id);

    let hoursToSave = data.hours;
    if (data.startTime || data.endTime) {
      const existing = await this.prisma.timeLog.findUnique({ where: { id } });
      const start = data.startTime ?? existing?.startTime ?? undefined;
      const end = data.endTime ?? existing?.endTime ?? undefined;
      hoursToSave = this.computeHours(start, end, data.hours ?? existing?.hours);
    }

    return this.prisma.timeLog.update({
      where: { id },
      data: {
        ...data,
        hours: hoursToSave,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, vin: true, brand: true, model: true, workDescription: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.timeLog.delete({
      where: { id },
    });
  }
}
