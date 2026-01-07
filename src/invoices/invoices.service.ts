import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      type: string;
      customerName: string;
      customerEmail?: string;
      customerAddress?: string;
      items: any[];
      taxRate?: number;
      notes?: string;
      vehicleId: string;
    },
    userId: string,
  ) {
    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = data.taxRate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Generate invoice number
    const count = await this.prisma.invoice.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.invoice.create({
      data: {
        invoiceNumber,
        type: data.type,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerAddress: data.customerAddress,
        items: data.items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: data.notes,
        vehicleId: data.vehicleId,
        createdById: userId,
      },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findAll(filters?: { vehicleId?: string; type?: string; status?: string }) {
    return this.prisma.invoice.findMany({
      where: filters,
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Rechnung mit ID ${id} nicht gefunden`);
    }
    return invoice;
  }

  async update(
    id: string,
    data: {
      status?: string;
      customerName?: string;
      customerEmail?: string;
      customerAddress?: string;
      items?: any[];
      taxRate?: number;
      notes?: string;
    },
  ) {
    const invoice = await this.findOne(id);

    // Recalculate if items changed
    let updateData: any = { ...data };
    if (data.items) {
      const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
      const taxRate = data.taxRate !== undefined ? data.taxRate : invoice.taxRate;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      updateData = {
        ...updateData,
        subtotal,
        taxRate,
        taxAmount,
        total,
      };
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.invoice.delete({
      where: { id },
    });
  }
}
