import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSessionsService } from '../work-sessions/work-sessions.service';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private workSessionsService: WorkSessionsService,
  ) {}

  async create(
    data: {
      description: string;
      category: string;
      amount: number;
      date: Date;
      notes?: string;
      vehicleId?: string;
    },
    userId: string,
  ) {
    if (data.amount <= 0) {
      throw new BadRequestException('Betrag muss größer als 0 sein');
    }

    return this.prisma.expense.create({
      data: {
        description: data.description,
        category: data.category,
        amount: data.amount,
        date: data.date,
        notes: data.notes,
        vehicleId: data.vehicleId || null,
        createdById: userId,
      },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findAll(filters?: {
    vehicleId?: string;
    category?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (filters?.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) {
        where.date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.date.lte = filters.endDate;
      }
    }

    return this.prisma.expense.findMany({
      where,
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException(`Ausgabe mit ID ${id} nicht gefunden`);
    }

    return expense;
  }

  async update(
    id: string,
    data: {
      description?: string;
      category?: string;
      amount?: number;
      date?: Date;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    const expense = await this.findOne(id);

    if (data.amount !== undefined && data.amount <= 0) {
      throw new BadRequestException('Betrag muss größer als 0 sein');
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        description: data.description,
        category: data.category,
        amount: data.amount,
        date: data.date,
        notes: data.notes,
        vehicleId: data.vehicleId,
      },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.expense.delete({
      where: { id },
    });
  }

  async getTotal(filters?: {
    vehicleId?: string;
    category?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (filters?.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) {
        where.date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.date.lte = filters.endDate;
      }
    }

    const result = await this.prisma.expense.aggregate({
      where,
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalAmount: result._sum.amount || 0,
      totalCount: result._count.id || 0,
    };
  }

  async calculateWorkerSalaries(startDate: Date, endDate: Date) {
    // Get all active workers
    const workers = await this.prisma.user.findMany({
      where: { isActive: true, role: 'worker' },
      select: {
        id: true,
        name: true,
        email: true,
        hourlyRate: true,
      },
    });

    // Calculate salary for each worker
    const salaries = await Promise.all(
      workers.map(async (worker) => {
        const totalHours = await this.workSessionsService.getTotalHours(
          worker.id,
          startDate,
          endDate,
        );

        const hourlyRate = worker.hourlyRate || 35; // Default to 35 if not set
        const salary = totalHours * hourlyRate;

        return {
          userId: worker.id,
          userName: worker.name || worker.email,
          userEmail: worker.email,
          hourlyRate,
          totalHours: Math.round(totalHours * 100) / 100,
          salary: Math.round(salary * 100) / 100,
        };
      }),
    );

    // Filter out workers with 0 hours
    return salaries.filter((s) => s.totalHours > 0);
  }
}

