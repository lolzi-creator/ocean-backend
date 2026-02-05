import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { WebChatService } from './web-chat.service';

@Controller('web-chat')
export class WebChatController {
  constructor(private readonly webChatService: WebChatService) {}

  /**
   * Start a new chat session
   * Returns a session ID for tracking the conversation
   */
  @Post('session')
  startSession() {
    const sessionId = this.webChatService.createSession();
    return {
      sessionId,
      message: 'Willkommen bei Ocean Garage! Wie kann ich Ihnen heute helfen? Sie können einen Termin vereinbaren, Fragen zu unseren Services stellen oder allgemeine Informationen erhalten.',
    };
  }

  /**
   * Send a message in an existing chat session
   * The AI will respond and potentially book appointments
   */
  @Post('message')
  async sendMessage(
    @Body() body: { sessionId: string; message: string },
  ) {
    const { sessionId, message } = body;
    
    if (!sessionId || !message) {
      return {
        error: 'sessionId and message are required',
      };
    }

    const response = await this.webChatService.processMessage(sessionId, message);
    return response;
  }

  /**
   * Get conversation history for a session
   */
  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    const session = this.webChatService.getSessionHistory(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    return session;
  }

  /**
   * End a chat session
   */
  @Delete('session/:sessionId')
  endSession(@Param('sessionId') sessionId: string) {
    this.webChatService.endSession(sessionId);
    return { message: 'Session ended' };
  }

  /**
   * Get available time slots for a specific date
   */
  @Get('availability/:date')
  async getAvailability(@Param('date') date: string) {
    return this.webChatService.getAvailableSlots(date);
  }
}
