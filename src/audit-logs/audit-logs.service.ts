import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string;
    changes?: any;
  }) {
    return this.prisma.auditLog.create({
      data,
    });
  }

  async findAll(filters?: { entityType?: string; entityId?: string; userId?: string }) {
    return this.prisma.auditLog.findMany({
      where: filters,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByEntity(entityType: string, entityId: string) {
    return this.findAll({ entityType, entityId });
  }
}
