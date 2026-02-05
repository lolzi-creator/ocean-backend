import { Module } from '@nestjs/common';
import { ServiceTemplatesService } from './service-templates.service';
import { ServiceTemplatesController } from './service-templates.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [ServiceTemplatesController],
  providers: [ServiceTemplatesService],
  exports: [ServiceTemplatesService],
})
export class ServiceTemplatesModule {}
