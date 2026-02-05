import { Module } from '@nestjs/common';
import { WebChatController } from './web-chat.controller';
import { WebChatService } from './web-chat.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WebChatController],
  providers: [WebChatService],
  exports: [WebChatService],
})
export class WebChatModule {}
