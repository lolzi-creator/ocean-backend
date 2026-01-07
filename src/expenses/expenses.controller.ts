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
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createExpenseDto: {
      description: string;
      category: string;
      amount: number;
      date: string;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    return this.expensesService.create(
      {
        ...createExpenseDto,
        date: new Date(createExpenseDto.date),
      },
      user.id,
    );
  }

  @Get()
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (vehicleId) filters.vehicleId = vehicleId;
    if (category) filters.category = category;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.expensesService.findAll(filters);
  }

  @Get('total')
  getTotal(
    @Query('vehicleId') vehicleId?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (vehicleId) filters.vehicleId = vehicleId;
    if (category) filters.category = category;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.expensesService.getTotal(filters);
  }

  @Get('salaries')
  getSalaries(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Default to current month (25th to 25th)
    const now = new Date();
    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Calculate period from 25th to 25th
      const currentDay = now.getDate();
      if (currentDay >= 25) {
        // Current month 25th to next month 25th
        start = new Date(now.getFullYear(), now.getMonth(), 25);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 25);
      } else {
        // Previous month 25th to current month 25th
        start = new Date(now.getFullYear(), now.getMonth() - 1, 25);
        end = new Date(now.getFullYear(), now.getMonth(), 25);
      }
    }

    return this.expensesService.calculateWorkerSalaries(start, end);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    updateExpenseDto: {
      description?: string;
      category?: string;
      amount?: number;
      date?: string;
      notes?: string;
      vehicleId?: string;
    },
  ) {
    return this.expensesService.update(id, {
      ...updateExpenseDto,
      date: updateExpenseDto.date ? new Date(updateExpenseDto.date) : undefined,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}

