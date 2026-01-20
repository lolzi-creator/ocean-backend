import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { TimeLogsModule } from './time-logs/time-logs.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ExpensesModule } from './expenses/expenses.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { WorkSessionsModule } from './work-sessions/work-sessions.module';
import { DerendingerModule } from './derendinger/derendinger.module';

@Module({
  imports: [PrismaModule, SupabaseModule, AuthModule, UsersModule, AuditLogsModule, TimeLogsModule, InvoicesModule, ExpensesModule, VehiclesModule, WhatsAppModule, AppointmentsModule, WorkSessionsModule, DerendingerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
