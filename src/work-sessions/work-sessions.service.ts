import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkSessionsService {
  private readonly logger = new Logger(WorkSessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.checkIn = {};
      if (filters.startDate) {
        where.checkIn.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.checkIn.lte = filters.endDate;
      }
    }

    return this.prisma.workSession.findMany({
      where,
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
        checkIn: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.workSession.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Work session with ID ${id} not found`);
    }

    return session;
  }

  async findActiveSession(userId: string) {
    return this.prisma.workSession.findFirst({
      where: {
        userId,
        checkOut: null, // Active session has no checkOut
      },
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
        checkIn: 'desc',
      },
    });
  }

  async checkIn(userId: string) {
    // Check if user already has an active session
    const activeSession = await this.findActiveSession(userId);
    if (activeSession) {
      throw new Error('You already have an active work session. Please check out first.');
    }

    return this.prisma.workSession.create({
      data: {
        userId,
        checkIn: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async checkOut(userId: string) {
    const activeSession = await this.findActiveSession(userId);
    if (!activeSession) {
      throw new Error('No active work session found. Please check in first.');
    }

    const checkOut = new Date();
    const hours = (checkOut.getTime() - activeSession.checkIn.getTime()) / (1000 * 60 * 60);

    return this.prisma.workSession.update({
      where: { id: activeSession.id },
      data: {
        checkOut,
        hours: Math.round(hours * 100) / 100, // Round to 2 decimal places
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getTotalHours(userId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      userId,
      checkOut: { not: null }, // Only completed sessions
    };

    if (startDate || endDate) {
      where.checkIn = {};
      if (startDate) {
        where.checkIn.gte = startDate;
      }
      if (endDate) {
        where.checkIn.lte = endDate;
      }
    }

    const sessions = await this.prisma.workSession.findMany({
      where,
      select: {
        hours: true,
      },
    });

    return sessions.reduce((total, session) => total + (session.hours || 0), 0);
  }

  async createManual(
    userId: string,
    checkIn: Date,
    checkOut: Date,
  ) {
    if (checkOut <= checkIn) {
      throw new Error('Check-out time must be after check-in time');
    }

    const hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

    return this.prisma.workSession.create({
      data: {
        userId,
        checkIn,
        checkOut,
        hours: Math.round(hours * 100) / 100, // Round to 2 decimal places
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}

