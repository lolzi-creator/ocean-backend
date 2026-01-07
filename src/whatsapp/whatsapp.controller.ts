import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { AppointmentsService } from '../appointments/appointments.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  /**
   * Webhook endpoint for receiving messages (POST)
   * Twilio will POST to this endpoint when a message is received
   * Note: Twilio uses signature verification, but for sandbox testing we accept all POSTs
   */
  @Post('webhook')
  async handleWebhook(@Body() body: any, @Res() res: Response) {
    try {
      // Twilio sends messages in this format:
      // {
      //   "MessageSid": "...",
      //   "AccountSid": "...",
      //   "From": "whatsapp:+1234567890",
      //   "To": "whatsapp:+14155238886",
      //   "Body": "Hello",
      //   ...
      // }

      const from = body.From?.replace('whatsapp:', '') || body.From;
      const messageBody = body.Body || '';

      if (!from || !messageBody) {
        return res.status(HttpStatus.BAD_REQUEST).send('Missing required fields');
      }

      // Check for confirm/cancel commands first
      const lowerMessage = messageBody.toLowerCase().trim();
      
      // Handle confirm/cancel commands
      if (lowerMessage.includes('bestätigen') || lowerMessage.includes('bestätige') || 
          (lowerMessage.includes('ja') && (lowerMessage.includes('passt') || lowerMessage.includes('ok')))) {
        const appointments = await this.appointmentsService.findAll({ status: 'pending' });
        const customerAppointment = appointments.find(
          (apt) => apt.customerPhone === from || apt.customerPhone === `whatsapp:${from}`,
        );
        
        if (customerAppointment) {
          await this.appointmentsService.update(customerAppointment.id, { status: 'confirmed' });
          const dateStr = new Date(customerAppointment.date).toLocaleString('de-CH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const confirmMessage = `Vielen Dank! Ihr Termin wurde bestätigt:\n📅 ${dateStr}\n🔧 ${customerAppointment.serviceType}\n\nWir freuen uns auf Sie!\n\nKann ich Ihnen noch bei etwas anderem helfen?`;
          await this.whatsappService.sendMessage(from, confirmMessage);
          this.whatsappService.markTaskCompleted(from, 'appointment_confirmed');
          return res.status(HttpStatus.OK).send();
        }
      }
      
      if (lowerMessage.includes('absagen') || lowerMessage.includes('abbrechen') || lowerMessage.includes('stornieren')) {
        const appointments = await this.appointmentsService.findAll({ status: 'pending' });
        const customerAppointment = appointments.find(
          (apt) => apt.customerPhone === from || apt.customerPhone === `whatsapp:${from}`,
        );
        
        if (customerAppointment) {
          await this.appointmentsService.update(customerAppointment.id, { status: 'cancelled' });
          const cancelMessage = 'Ihr Termin wurde abgesagt. Falls Sie einen neuen Termin wünschen, lassen Sie es uns wissen!\n\nKann ich Ihnen noch bei etwas anderem helfen?';
          await this.whatsappService.sendMessage(from, cancelMessage);
          this.whatsappService.markTaskCompleted(from, 'appointment_cancelled');
          return res.status(HttpStatus.OK).send();
        }
      }

      // Get availability info for AI context - check real appointments in database
      let availabilityInfo = '';
      let targetDate: Date | null = null;
      
      // Try to parse date from message (DD.MM.YYYY or DD-MM-YYYY format)
      const dateMatch = messageBody.match(/(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/);
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        targetDate.setHours(0, 0, 0, 0);
      } else if (lowerMessage.includes('morgen')) {
        targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(0, 0, 0, 0);
      } else if (lowerMessage.includes('heute')) {
        targetDate = new Date();
        targetDate.setHours(0, 0, 0, 0);
      }
      
      // Check availability if user is asking about appointments
      if (lowerMessage.includes('termin') || lowerMessage.includes('appointment') || 
          lowerMessage.includes('verfügbar') || lowerMessage.includes('buch') ||
          lowerMessage.includes('grose service') || lowerMessage.includes('gross service') ||
          lowerMessage.includes('kleinservice') || lowerMessage.includes('klein service') ||
          targetDate) {
        
        // Default to tomorrow if no specific date mentioned
        if (!targetDate) {
          targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 1);
          targetDate.setHours(0, 0, 0, 0);
        }
        
        const dateEnd = new Date(targetDate);
        dateEnd.setHours(23, 59, 59, 999);
        
        // Check which time slots are available (9:00, 10:00, 11:00, 13:00, 14:00, 15:00)
        const timeSlots = [9, 10, 11, 13, 14, 15];
        const availableSlots: string[] = [];
        
        for (const hour of timeSlots) {
          const slotTime = new Date(targetDate);
          slotTime.setHours(hour, 0, 0, 0);
          
          const isAvailable = await this.appointmentsService.checkAvailability(slotTime);
          if (isAvailable) {
            availableSlots.push(`${hour}:00 Uhr`);
          }
        }
        
        const dateStr = targetDate.toLocaleDateString('de-CH', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        
        if (availableSlots.length > 0) {
          availabilityInfo = ` Für ${dateStr} sind folgende Zeiten verfügbar: ${availableSlots.join(', ')}.`;
        } else {
          availabilityInfo = ` Für ${dateStr} sind wir leider bereits voll. Bitte geben Sie uns ein anderes gewünschtes Datum.`;
        }
      }

      // Process the message and generate response with availability context
      const responseMessage = await this.whatsappService.processIncomingMessage(
        from,
        messageBody,
        availabilityInfo,
      );

      // Only send response if not empty (empty means duplicate/ignored)
      if (responseMessage && responseMessage.trim().length > 0) {
        await this.whatsappService.sendMessage(from, responseMessage);
      }

      // Twilio expects a TwiML response or 200 OK
      res.status(HttpStatus.OK).send();
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error processing webhook');
    }
  }
}

