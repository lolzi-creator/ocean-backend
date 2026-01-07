import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany();
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`Benutzer mit ID ${id} nicht gefunden`);
    }
    return user;
  }

  async findBySupabaseId(supabaseId: string) {
    return this.prisma.user.findUnique({
      where: { supabaseId },
    });
  }

  async findByPin(pin: string, userId?: string) {
    const where: any = { pin, isActive: true };
    if (userId) {
      where.id = userId;
    }
    return this.prisma.user.findFirst({
      where,
    });
  }

  async findAllWorkers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(data: { supabaseId?: string; email: string; name?: string; role?: string; pin?: string }, createdById?: string) {
    const user = await this.prisma.user.create({
      data: {
        ...data,
        createdById,
        updatedById: createdById,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (createdById) {
      await this.auditLogsService.create({
        action: 'CREATE',
        entityType: 'user',
        entityId: user.id,
        userId: createdById,
        changes: data,
      });
    }

    return user;
  }

  async update(id: string, data: { name?: string; role?: string; isActive?: boolean; pin?: string; hourlyRate?: number }, updatedById: string) {
    const oldUser = await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        updatedById,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLogsService.create({
      action: 'UPDATE',
      entityType: 'user',
      entityId: user.id,
      userId: updatedById,
      changes: { old: oldUser, new: data },
    });

    return user;
  }

  async remove(id: string, deletedById: string) {
    const user = await this.findOne(id);

    await this.auditLogsService.create({
      action: 'DELETE',
      entityType: 'user',
      entityId: user.id,
      userId: deletedById,
      changes: user,
    });

    return this.prisma.user.delete({
      where: { id },
    });
  }
}
