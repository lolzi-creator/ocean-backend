import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async findAll(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    vehicleId?: string;
  }) {
    const where: any = {};

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) {
        where.date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.date.lte = filters.endDate;
      }
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        vehicle: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        vehicle: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    return appointment;
  }

  async create(
    createAppointmentDto: {
      date: Date;
      customerName: string;
      customerPhone?: string;
      customerEmail?: string;
      serviceType: string;
      notes?: string;
      vehicleId?: string;
    },
    userId?: string,
  ) {
    const appointment = await this.prisma.appointment.create({
      data: {
        date: createAppointmentDto.date,
        customerName: createAppointmentDto.customerName,
        customerPhone: createAppointmentDto.customerPhone,
        customerEmail: createAppointmentDto.customerEmail,
        serviceType: createAppointmentDto.serviceType,
        notes: createAppointmentDto.notes,
        vehicleId: createAppointmentDto.vehicleId,
        createdById: userId,
        status: 'pending',
      },
      include: {
        vehicle: true,
      },
    });

    // Send WhatsApp confirmation if phone number provided
    if (createAppointmentDto.customerPhone) {
      try {
        const dateStr = new Date(appointment.date).toLocaleString('de-CH', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const message = `Hallo ${appointment.customerName}!\n\nIhr Termin bei Ocean Garage wurde erstellt:\n📅 ${dateStr}\n🔧 Service: ${appointment.serviceType}\n\nStatus: Ausstehend\n\n✅ Zum Bestätigen: Antworten Sie mit "bestätigen"\n❌ Zum Absagen: Antworten Sie mit "absagen"`;

        await this.whatsappService.sendMessage(
          createAppointmentDto.customerPhone,
          message,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send WhatsApp confirmation: ${error}`,
        );
        // Don't fail the appointment creation if WhatsApp fails
      }
    }

    return appointment;
  }

  async update(
    id: string,
    updateAppointmentDto: {
      date?: Date;
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      serviceType?: string;
      status?: string;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    const existing = await this.findOne(id);

    const appointment = await this.prisma.appointment.update({
      where: { id },
      data: {
        date: updateAppointmentDto.date,
        customerName: updateAppointmentDto.customerName,
        customerPhone: updateAppointmentDto.customerPhone,
        customerEmail: updateAppointmentDto.customerEmail,
        serviceType: updateAppointmentDto.serviceType,
        status: updateAppointmentDto.status,
        notes: updateAppointmentDto.notes,
        vehicleId: updateAppointmentDto.vehicleId,
      },
      include: {
        vehicle: true,
      },
    });

    // Send WhatsApp notification if status changed
    if (
      updateAppointmentDto.status &&
      updateAppointmentDto.status !== existing.status &&
      appointment.customerPhone
    ) {
      try {
        const dateStr = new Date(appointment.date).toLocaleString('de-CH', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        let message = '';
        if (updateAppointmentDto.status === 'confirmed') {
          message = `Hallo ${appointment.customerName}!\n\nIhr Termin wurde bestätigt:\n📅 ${dateStr}\n🔧 Service: ${appointment.serviceType}\n\nWir freuen uns auf Sie!`;
        } else if (updateAppointmentDto.status === 'cancelled') {
          message = `Hallo ${appointment.customerName}!\n\nIhr Termin wurde abgesagt:\n📅 ${dateStr}\n🔧 Service: ${appointment.serviceType}\n\nBei Fragen kontaktieren Sie uns bitte.`;
        }

        if (message) {
          await this.whatsappService.sendMessage(
            appointment.customerPhone!,
            message,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to send WhatsApp notification: ${error}`);
      }
    }

    return appointment;
  }

  async remove(id: string) {
    await this.findOne(id); // Throws if not found
    return this.prisma.appointment.delete({
      where: { id },
    });
  }

  async checkAvailability(date: Date): Promise<boolean> {
    // Check if there's an appointment at the same time (within 1 hour window)
    const startTime = new Date(date);
    startTime.setHours(startTime.getHours() - 1);

    const endTime = new Date(date);
    endTime.setHours(endTime.getHours() + 1);

    const conflictingAppointments = await this.prisma.appointment.count({
      where: {
        date: {
          gte: startTime,
          lte: endTime,
        },
        status: {
          not: 'cancelled',
        },
      },
    });

    // Allow up to 2 appointments per hour (you can adjust this)
    return conflictingAppointments < 2;
  }
}


