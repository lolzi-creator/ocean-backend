import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { getServicePackage } from './service-packages';

@Injectable()
export class VehiclesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async findAll() {
    return this.prisma.vehicle.findMany();
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }
    return vehicle;
  }

  async decodeVin(vin: string) {
    try {
      const response = await fetch(`https://api.auto.dev/vin/${vin}`, {
        headers: {
          'Authorization': `Bearer ${process.env.AUTO_DEV_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new BadRequestException('Failed to decode VIN');
      }

      const data = await response.json();
      
      // Return ALL data from the API - don't filter anything
      // This includes all the detailed information about the vehicle
      return data;
    } catch (error) {
      throw new BadRequestException('Invalid VIN or API error');
    }
  }

  async create(data: { vin: string; brand?: string; model?: string; year?: number; trim?: string; style?: string; bodyType?: string; engine?: string; transmission?: string; drive?: string; manufacturer?: string; origin?: string; licensePlate?: string; workDescription?: string; serviceType?: string; color?: string; mileage?: number; photoUrl?: string; documentPhotoUrl?: string; customerName?: string; customerEmail?: string; customerPhone?: string; isActive?: boolean }, userId: string) {
    // Check if vehicle with this VIN already exists
    const existingVehicle = await this.prisma.vehicle.findUnique({
      where: { vin: data.vin },
    });

    if (existingVehicle) {
      throw new BadRequestException(
        `Ein Fahrzeug mit der VIN ${data.vin} existiert bereits. Bitte wählen Sie ein anderes Fahrzeug oder bearbeiten Sie das bestehende.`
      );
    }

    try {
      const vehicle = await this.prisma.vehicle.create({
        data: {
          ...data,
          createdById: userId,
          updatedById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await this.auditLogsService.create({
        action: 'CREATE',
        entityType: 'vehicle',
        entityId: vehicle.id,
        userId,
        changes: data,
      });

      // Create expenses automatically if serviceType is provided
      if (data.serviceType) {
        await this.createExpensesForService(vehicle.id, data.serviceType, userId);
      }

      return vehicle;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(
          `Ein Fahrzeug mit der VIN ${data.vin} existiert bereits.`
        );
      }
      throw error;
    }
  }

  async update(id: string, data: { brand?: string; model?: string; year?: number; trim?: string; style?: string; bodyType?: string; engine?: string; transmission?: string; drive?: string; manufacturer?: string; origin?: string; licensePlate?: string; workDescription?: string; serviceType?: string; color?: string; mileage?: number; photoUrl?: string; documentPhotoUrl?: string; customerName?: string; customerEmail?: string; customerPhone?: string; isActive?: boolean }, userId: string) {
    const oldVehicle = await this.findOne(id);

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        ...data,
        updatedById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

      await this.auditLogsService.create({
        action: 'UPDATE',
        entityType: 'vehicle',
        entityId: vehicle.id,
        userId,
        changes: { old: oldVehicle, new: data },
      });

      // Create expenses automatically if serviceType is provided and changed
      if (data.serviceType && data.serviceType !== oldVehicle.serviceType) {
        await this.createExpensesForService(vehicle.id, data.serviceType, userId);
      }

      return vehicle;
  }

  async remove(id: string, userId: string) {
    const vehicle = await this.findOne(id);

    await this.auditLogsService.create({
      action: 'DELETE',
      entityType: 'vehicle',
      entityId: vehicle.id,
      userId,
      changes: vehicle,
    });

    return this.prisma.vehicle.delete({
      where: { id },
    });
  }

  private async createExpensesForService(vehicleId: string, serviceType: string, userId: string) {
    const servicePackage = getServicePackage(serviceType);
    if (!servicePackage) return;

    // Check if expenses already exist for this vehicle and service type
    const existingExpenses = await this.prisma.expense.findMany({
      where: {
        vehicleId,
        description: { contains: servicePackage.name },
      },
    });

    // Only create if they don't exist yet
    if (existingExpenses.length === 0) {
      const now = new Date();
      
      for (const article of servicePackage.articles) {
        // Skip labor articles (they will be calculated from time logs)
        if (article.category === 'labor' && article.unitPrice === 0) {
          continue;
        }

        const total = article.quantity * article.unitPrice;
        if (total > 0) {
          await this.prisma.expense.create({
            data: {
              description: `${article.description}${article.quantity > 1 ? ` (${article.quantity}x)` : ''}`,
              category: article.category === 'parts' ? 'parts' : 
                       article.category === 'supplies' ? 'supplies' : 'other',
              amount: total,
              date: now,
              notes: `Automatisch erstellt für ${servicePackage.name}`,
              vehicleId,
              createdById: userId,
            },
          });
        }
      }
    }
  }

  async createInvoiceFromVehicle(vehicleId: string, customerName: string, userId: string, customerEmail?: string, customerAddress?: string) {
    const vehicle = await this.findOne(vehicleId);
    
    // Get all expenses for this vehicle
    const expenses = await this.prisma.expense.findMany({
      where: { vehicleId },
    });

    // Get all time logs for this vehicle
    const timeLogs = await this.prisma.timeLog.findMany({
      where: { vehicleId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const totalHours = timeLogs.reduce((sum, log) => sum + log.hours, 0);
    const hourlyRate = 120; // CHF per hour - can be made configurable later

    // Build invoice items
    const items: any[] = [];

    // Add expenses as items
    for (const expense of expenses) {
      items.push({
        description: expense.description,
        quantity: 1,
        unitPrice: expense.amount,
        total: expense.amount,
      });
    }

    // Add labor hours
    if (totalHours > 0) {
      const laborTotal = totalHours * hourlyRate;
      items.push({
        description: `Arbeitsstunden (${totalHours.toFixed(2)}h)`,
        quantity: totalHours,
        unitPrice: hourlyRate,
        total: laborTotal,
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = 7.7; // Swiss VAT
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Generate invoice number
    const count = await this.prisma.invoice.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        type: 'invoice',
        status: 'draft',
        customerName,
        customerEmail,
        customerAddress,
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: `Erstellt automatisch für ${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.vin})`,
        vehicleId,
        createdById: userId,
      },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return invoice;
  }

  async createEstimateFromVehicle(vehicleId: string, customerName?: string, userId?: string, customerEmail?: string, customerAddress?: string) {
    const vehicle = await this.findOne(vehicleId);
    
    if (!vehicle.serviceType) {
      throw new BadRequestException('Fahrzeug hat keinen Service-Typ. Bitte wählen Sie zuerst einen Service-Typ.');
    }

    // Use customer info from vehicle if not provided
    const finalCustomerName = customerName || vehicle.customerName;
    const finalCustomerEmail = customerEmail || vehicle.customerEmail;
    
    if (!finalCustomerName) {
      throw new BadRequestException('Fahrzeug hat keine Kundendaten. Bitte erfassen Sie zuerst die Kundendaten beim Fahrzeug.');
    }

    const servicePackage = getServicePackage(vehicle.serviceType);
    if (!servicePackage) {
      throw new BadRequestException(`Service-Typ "${vehicle.serviceType}" nicht gefunden`);
    }

    // Get expenses for this vehicle (already created from service type)
    const expenses = await this.prisma.expense.findMany({
      where: { vehicleId },
    });

    const hourlyRate = 120; // CHF per hour
    const estimatedHours = servicePackage.estimatedHours;

    // Build estimate items
    const items: any[] = [];

    // Add expenses as items
    for (const expense of expenses) {
      items.push({
        description: expense.description,
        quantity: 1,
        unitPrice: expense.amount,
        total: expense.amount,
      });
    }

    // Add estimated labor hours
    if (estimatedHours > 0) {
      const laborTotal = estimatedHours * hourlyRate;
      items.push({
        description: `Arbeitsstunden (geschätzt: ${estimatedHours.toFixed(2)}h)`,
        quantity: estimatedHours,
        unitPrice: hourlyRate,
        total: laborTotal,
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = 7.7; // Swiss VAT
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Generate estimate number
    const count = await this.prisma.invoice.count();
    const estimateNumber = `EST-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    // Create estimate
    const estimate = await this.prisma.invoice.create({
      data: {
        invoiceNumber: estimateNumber,
        type: 'estimate',
        status: 'draft',
        customerName: finalCustomerName,
        customerEmail: finalCustomerEmail,
        customerAddress,
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: `Angebot für ${servicePackage.name} - ${vehicle.brand || ''} ${vehicle.model || ''} (${vehicle.vin})`,
        vehicleId,
        createdById: userId || null,
      },
      include: {
        vehicle: { select: { id: true, vin: true, brand: true, model: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return estimate;
  }
}
