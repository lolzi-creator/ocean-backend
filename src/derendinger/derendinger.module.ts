import { Module } from '@nestjs/common';
import { DerendingerService } from './derendinger.service';
import { DerendingerController } from './derendinger.controller';
import { UsersModule } from '../users/users.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [UsersModule, SupabaseModule],
  controllers: [DerendingerController],
  providers: [DerendingerService],
  exports: [DerendingerService],
})
export class DerendingerModule {}
