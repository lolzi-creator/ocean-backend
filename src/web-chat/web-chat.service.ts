import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Groq from 'groq-sdk';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface BookingData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceType?: string;
  date?: string;
  time?: string;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  bookingData: BookingData;
  bookingConfirmed: boolean;
  createdAt: Date;
  lastActivity: Date;
}

@Injectable()
export class WebChatService {
  private readonly logger = new Logger(WebChatService.name);
  private groqClient: Groq | null = null;
  private sessions: Map<string, ChatSession> = new Map();

  // Available services at Ocean Garage (real data from website)
  private readonly services = [
    { name: 'Reparaturen', duration: 120, description: 'Motor- & Getriebeinstandsetzung', price: 'Angebot auf Anfrage' },
    { name: 'Wartung', duration: 60, description: 'Ölwechsel, Filterwechsel, Flüssigkeitsauffüllung', price: 'Ab CHF 150' },
    { name: 'Ölwechsel', duration: 30, description: 'Motoröl und Filter wechseln', price: 'Ab CHF 150' },
    { name: 'Diagnose', duration: 30, description: 'Computerdiagnose, Fehlerspeicher auslesen', price: 'CHF 80' },
    { name: 'MFK Vorbereitung', duration: 90, description: 'Vorab-Check für Motorfahrzeugkontrolle', price: 'Ab CHF 120' },
    { name: 'Reifenwechsel', duration: 45, description: 'Wechsel, Auswuchten & Lagerung', price: 'Ab CHF 60' },
    { name: 'Klima Service', duration: 60, description: 'Klimaanlage warten, nachfüllen, reinigen', price: 'CHF 120' },
    { name: 'Inspektion', duration: 60, description: 'Vollständige Fahrzeuginspektion', price: 'Angebot auf Anfrage' },
  ];

  // Business info (real data from website)
  private readonly garageInfo = {
    name: 'Ocean Garage / Ocean Car GmbH',
    address: 'Zikadenweg 42a, 3006 Bern',
    phone: '031 332 60 30',
    whatsapp: '+41 78 678 87 09',
    email: 'info@oceancar.ch',
    emergency: '24h Notdienst verfügbar',
  };

  // Business hours (real data from website)
  private readonly businessHours = {
    start: 7, // 07:00
    end: 18, // 18:00
    slotDuration: 60, // minutes
    workDays: [1, 2, 3, 4, 5], // Monday to Friday
  };

  constructor(private readonly prisma: PrismaService) {
    // Initialize Groq client
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      this.groqClient = new Groq({ apiKey: groqApiKey });
      this.logger.log('Groq client initialized for web chat');
    } else {
      this.logger.warn('GROQ_API_KEY not found. AI chat features will be disabled.');
    }

    // Cleanup old sessions every hour
    setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
  }

  /**
   * Create a new chat session
   */
  createSession(): string {
    const sessionId = this.generateSessionId();
    const session: ChatSession = {
      id: sessionId,
      messages: [],
      bookingData: {},
      bookingConfirmed: false,
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    this.sessions.set(sessionId, session);
    this.logger.log(`New chat session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * Process a user message and generate AI response
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
  ): Promise<{
    response: string;
    bookingData?: BookingData;
    appointmentCreated?: boolean;
    appointmentId?: string;
    readyToBook?: boolean;
  }> {
    let session = this.sessions.get(sessionId);

    // Create session if it doesn't exist
    if (!session) {
      sessionId = this.createSession();
      session = this.sessions.get(sessionId)!;
    }

    session.lastActivity = new Date();

    // Add user message to history
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });

    // Check if Groq is available
    if (!this.groqClient) {
      const fallbackResponse = 'Der Chat-Service ist momentan nicht verfügbar. Bitte rufen Sie uns an unter +41 XX XXX XX XX.';
      session.messages.push({ role: 'assistant', content: fallbackResponse, timestamp: new Date() });
      return { response: fallbackResponse };
    }

    try {
      // Check if this is a confirmation request (from button click)
      if (userMessage === '__CONFIRM_BOOKING__') {
        if (this.isBookingComplete(session.bookingData) && !session.bookingConfirmed) {
          try {
            const appointment = await this.createAppointment(session.bookingData);
            session.bookingConfirmed = true;
            this.logger.log(`Appointment created via web chat: ${appointment.id}`);
            
            const confirmationMessage = this.generateBookingConfirmation(appointment);
            session.messages.push({ role: 'assistant', content: confirmationMessage, timestamp: new Date() });
            
            return {
              response: confirmationMessage,
              bookingData: session.bookingData,
              appointmentCreated: true,
              appointmentId: appointment.id,
            };
          } catch (error) {
            this.logger.error('Failed to create appointment:', error);
            const errorMessage = 'Es gab einen Fehler bei der Terminbuchung. Bitte versuchen Sie es erneut oder rufen Sie uns an.';
            session.messages.push({ role: 'assistant', content: errorMessage, timestamp: new Date() });
            return { response: errorMessage, bookingData: session.bookingData };
          }
        }
      }

      // Use AI to extract booking data AND generate response
      const aiResult = await this.processWithAI(session, userMessage);
      
      // Update booking data with AI-extracted info
      if (aiResult.extractedData) {
        session.bookingData = { ...session.bookingData, ...aiResult.extractedData };
      }
      
      const nowComplete = this.isBookingComplete(session.bookingData);
      this.logger.log(`Booking data: ${JSON.stringify(session.bookingData)}`);
      this.logger.log(`Booking complete: ${nowComplete}`);

      // Add AI response to history
      session.messages.push({
        role: 'assistant',
        content: aiResult.response,
        timestamp: new Date(),
      });

      // If all data is collected, signal frontend to show confirm button
      if (nowComplete && !session.bookingConfirmed) {
        return {
          response: aiResult.response,
          bookingData: session.bookingData,
          appointmentCreated: false,
          readyToBook: true,
        };
      }

      return {
        response: aiResult.response,
        bookingData: session.bookingData,
        appointmentCreated: false,
        readyToBook: false,
      };
    } catch (error) {
      this.logger.error('Error processing message:', error);
      const errorResponse = 'Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.';
      session.messages.push({ role: 'assistant', content: errorResponse, timestamp: new Date() });
      return { response: errorResponse };
    }
  }

  /**
   * Process message with AI - extracts data AND generates response
   */
  private async processWithAI(session: ChatSession, userMessage: string): Promise<{
    response: string;
    extractedData: Partial<BookingData>;
  }> {
    const servicesInfo = this.services.map(s => `${s.name} (${s.price})`).join(', ');
    const currentData = session.bookingData;
    const messages = this.buildMessageHistory(session);

    const systemPrompt = `Du bist der Terminassistent von ${this.garageInfo.name}, einer Autowerkstatt in Bern, Schweiz.

ÜBER UNS:
- Adresse: ${this.garageInfo.address}
- Telefon: ${this.garageInfo.phone}
- WhatsApp: ${this.garageInfo.whatsapp}
- E-Mail: ${this.garageInfo.email}
- ${this.garageInfo.emergency}

DEINE AUFGABE:
1. Extrahiere Buchungsinformationen aus der Kundennachricht
2. Generiere eine freundliche, kurze Antwort (2-3 Sätze)
3. Beantworte Fragen über unsere Werkstatt, Services und Preise

VERFÜGBARE SERVICES: ${servicesInfo}

ÖFFNUNGSZEITEN: Mo-Fr 07:00-18:00, Sa-So geschlossen

AKTUELLE BUCHUNGSDATEN:
- Name: ${currentData.customerName || 'FEHLT'}
- Telefon: ${currentData.customerPhone || 'FEHLT'}
- Service: ${currentData.serviceType || 'FEHLT'}
- Datum: ${currentData.date || 'FEHLT'}
- Uhrzeit: ${currentData.time || 'FEHLT'}

ANTWORTE NUR MIT DIESEM JSON FORMAT:
{
  "extracted": {
    "customerName": "Name falls genannt, sonst null",
    "customerPhone": "Telefonnummer falls genannt, sonst null",
    "serviceType": "Service falls genannt (muss einer der verfügbaren sein), sonst null",
    "date": "Datum im Format YYYY-MM-DD falls genannt, sonst null",
    "time": "Uhrzeit im Format HH:00 falls genannt, sonst null"
  },
  "response": "Deine freundliche Antwort an den Kunden"
}

WICHTIGE REGELN:
- "morgen" = ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- "heute" = ${new Date().toISOString().split('T')[0]}
- "übermorgen" = ${new Date(Date.now() + 172800000).toISOString().split('T')[0]}
- Wenn alle Daten vorhanden sind, bestätige die Details in deiner Antwort
- Frage nur nach FEHLENDEN Informationen
- Antworte auf Deutsch`;

    try {
      const completion = await this.groqClient!.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      this.logger.log(`AI raw response: ${content}`);
      
      const parsed = JSON.parse(content);
      
      // Clean up extracted data - remove nulls
      const extractedData: Partial<BookingData> = {};
      if (parsed.extracted) {
        if (parsed.extracted.customerName) extractedData.customerName = parsed.extracted.customerName;
        if (parsed.extracted.customerPhone) extractedData.customerPhone = parsed.extracted.customerPhone.replace(/\s/g, '');
        if (parsed.extracted.serviceType) extractedData.serviceType = parsed.extracted.serviceType;
        if (parsed.extracted.date) extractedData.date = parsed.extracted.date;
        if (parsed.extracted.time) extractedData.time = parsed.extracted.time;
      }

      return {
        response: parsed.response || 'Wie kann ich Ihnen helfen?',
        extractedData,
      };
    } catch (error) {
      this.logger.error('Groq API error:', error);
      return {
        response: 'Entschuldigung, es gab einen Fehler. Wie kann ich Ihnen helfen?',
        extractedData: {},
      };
    }
  }

  /**
   * Generate AI response using Groq (legacy - kept for compatibility)
   */
  private async generateAIResponse(session: ChatSession): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(session);
    const messages = this.buildMessageHistory(session);

    try {
      const completion = await this.groqClient!.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || '';
      return response.trim();
    } catch (error) {
      this.logger.error('Groq API error:', error);
      throw error;
    }
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(session: ChatSession): string {
    const servicesInfo = this.services
      .map(s => `- ${s.name}: ${s.description} (${s.price})`)
      .join('\n');

    const bookingStatus = this.getBookingStatusInfo(session.bookingData);

    return `Du bist der freundliche virtuelle Assistent von ${this.garageInfo.name}, einer Autowerkstatt in Bern, Schweiz.

DEINE AUFGABEN:
1. Kunden bei der Terminbuchung helfen
2. Informationen über unsere Services und Preise geben
3. Fragen zu Öffnungszeiten und Kontakt beantworten

UNSERE SERVICES:
${servicesInfo}

ÖFFNUNGSZEITEN:
Montag bis Freitag: 07:00 - 18:00 Uhr
Samstag & Sonntag: Geschlossen
${this.garageInfo.emergency}

KONTAKT:
Adresse: ${this.garageInfo.address}
Telefon: ${this.garageInfo.phone}
WhatsApp: ${this.garageInfo.whatsapp}
E-Mail: ${this.garageInfo.email}

TERMINBUCHUNG - BENÖTIGTE INFORMATIONEN:
${bookingStatus}

REGELN:
1. Antworte KURZ und PRÄZISE (maximal 3-4 Sätze)
2. Sei freundlich und professionell
3. Wenn Informationen für die Buchung fehlen, frage EINE Information nach der anderen
4. Bestätige die Buchung erst, wenn ALLE Informationen vorhanden sind
5. Verwende Schweizer Hochdeutsch
6. Wenn der Kunde "ja", "bestätigen" oder ähnliches sagt und alle Daten vollständig sind, bestätige die Buchung

AKTUELLER BUCHUNGSSTATUS:
${JSON.stringify(session.bookingData, null, 2)}`;
  }

  /**
   * Get booking status info for prompt
   */
  private getBookingStatusInfo(data: BookingData): string {
    const fields = [
      { key: 'customerName', label: 'Name', status: data.customerName ? '✓' : '✗' },
      { key: 'customerPhone', label: 'Telefon', status: data.customerPhone ? '✓' : '✗' },
      { key: 'serviceType', label: 'Service', status: data.serviceType ? '✓' : '✗' },
      { key: 'date', label: 'Datum', status: data.date ? '✓' : '✗' },
      { key: 'time', label: 'Uhrzeit', status: data.time ? '✓' : '✗' },
    ];

    return fields.map(f => `${f.status} ${f.label}: ${(data as any)[f.key] || 'nicht angegeben'}`).join('\n');
  }

  /**
   * Build message history for Groq
   */
  private buildMessageHistory(session: ChatSession): Array<{ role: 'user' | 'assistant'; content: string }> {
    // Only include last 10 messages to stay within token limits
    return session.messages
      .slice(-10)
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  /**
   * Extract booking information from user message
   */
  private extractBookingInfo(message: string, currentData: BookingData): Partial<BookingData> {
    const extracted: Partial<BookingData> = {};
    const lowerMessage = message.toLowerCase();

    // Extract service type
    for (const service of this.services) {
      if (lowerMessage.includes(service.name.toLowerCase())) {
        extracted.serviceType = service.name;
        break;
      }
    }

    // Extract date patterns (DD.MM.YYYY, DD.MM, morgen, übermorgen, etc.)
    const datePatterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      /(\d{1,2})\.(\d{1,2})\./,
      /(\d{1,2})\.(\d{1,2})/,
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
        extracted.date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        break;
      }
    }

    // Handle relative dates (German and English)
    if (lowerMessage.includes('morgen') || lowerMessage.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      extracted.date = tomorrow.toISOString().split('T')[0];
    } else if (lowerMessage.includes('übermorgen') || lowerMessage.includes('day after tomorrow')) {
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 2);
      extracted.date = dayAfter.toISOString().split('T')[0];
    } else if (lowerMessage.includes('heute') || lowerMessage.includes('today')) {
      extracted.date = new Date().toISOString().split('T')[0];
    } else if (lowerMessage.includes('montag') || lowerMessage.includes('monday')) {
      extracted.date = this.getNextWeekday(1);
    } else if (lowerMessage.includes('dienstag') || lowerMessage.includes('tuesday')) {
      extracted.date = this.getNextWeekday(2);
    } else if (lowerMessage.includes('mittwoch') || lowerMessage.includes('wednesday')) {
      extracted.date = this.getNextWeekday(3);
    } else if (lowerMessage.includes('donnerstag') || lowerMessage.includes('thursday')) {
      extracted.date = this.getNextWeekday(4);
    } else if (lowerMessage.includes('freitag') || lowerMessage.includes('friday')) {
      extracted.date = this.getNextWeekday(5);
    }

    // Extract time patterns (HH:MM, H Uhr, etc.)
    const timePatterns = [
      /(\d{1,2}):(\d{2})/,
      /(\d{1,2})\s*uhr/i,
      /um\s*(\d{1,2})/i,
    ];

    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) {
        const hour = parseInt(match[1]);
        const minute = match[2] ? parseInt(match[2]) : 0;
        if (hour >= this.businessHours.start && hour < this.businessHours.end) {
          extracted.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
        break;
      }
    }

    // Extract phone number (Swiss format)
    const phonePatterns = [
      /(\+41\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2})/,
      /(0\d{2}\s?\d{3}\s?\d{2}\s?\d{2})/,
      /(\d{10,})/,
    ];

    for (const pattern of phonePatterns) {
      const match = message.match(pattern);
      if (match) {
        extracted.customerPhone = match[1].replace(/\s/g, '');
        break;
      }
    }

    // Extract email
    const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const emailMatch = message.match(emailPattern);
    if (emailMatch) {
      extracted.customerEmail = emailMatch[1];
    }

    // Extract name (German and English patterns)
    const namePatterns = [
      /ich bin\s+([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /mein(?:e)?\s+name\s+(?:ist\s+)?([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /ich heisse\s+([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /my name\s+(?:is\s+)?([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /i am\s+([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /i'm\s+([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /name:\s*([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /name\s+(?:is\s+)?([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
      /heisse\s+([a-zA-ZäöüÄÖÜß]+(?:\s+[a-zA-ZäöüÄÖÜß]+)?)/i,
    ];

    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match) {
        // Capitalize first letter of each word
        extracted.customerName = match[1].trim()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        break;
      }
    }

    return extracted;
  }

  /**
   * Get next occurrence of a weekday
   */
  private getNextWeekday(targetDay: number): string {
    const today = new Date();
    const currentDay = today.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);
    return nextDate.toISOString().split('T')[0];
  }

  /**
   * Check if booking data is complete
   */
  private isBookingComplete(data: BookingData): boolean {
    return !!(
      data.customerName &&
      data.customerPhone &&
      data.serviceType &&
      data.date &&
      data.time
    );
  }

  /**
   * Check if user wants to confirm booking
   */
  private shouldCreateAppointment(session: ChatSession, lastMessage: string): boolean {
    if (session.bookingConfirmed) return false;
    if (!this.isBookingComplete(session.bookingData)) return false;

    const confirmPhrases = [
      'ja', 'yes', 'bestätigen', 'buchen', 'reservieren',
      'ok', 'okay', 'einverstanden', 'passt', 'perfekt',
      'gerne', 'bitte', 'klar', 'sicher', 'genau',
    ];

    const lower = lastMessage.toLowerCase().trim();
    return confirmPhrases.some(phrase => lower.includes(phrase));
  }

  /**
   * Create appointment in database
   */
  private async createAppointment(data: BookingData) {
    const dateTime = new Date(`${data.date}T${data.time}:00`);

    const appointment = await this.prisma.appointment.create({
      data: {
        date: dateTime,
        customerName: data.customerName!,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        serviceType: data.serviceType!,
        status: 'pending',
        notes: 'Gebucht über Website-Chat',
      },
    });

    this.logger.log(`Appointment created via web chat: ${appointment.id}`);
    return appointment;
  }

  /**
   * Generate booking confirmation message
   */
  private generateBookingConfirmation(appointment: any): string {
    const dateStr = new Date(appointment.date).toLocaleString('de-CH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `✅ **Ihr Termin wurde erfolgreich gebucht!**

📅 **Datum:** ${dateStr}
🔧 **Service:** ${appointment.serviceType}
👤 **Name:** ${appointment.customerName}
📞 **Telefon:** ${appointment.customerPhone || '-'}

Sie erhalten eine Bestätigung per WhatsApp/SMS. Bei Fragen erreichen Sie uns unter ${this.garageInfo.phone} oder per WhatsApp ${this.garageInfo.whatsapp}.

Vielen Dank, dass Sie Ocean Garage gewählt haben! 🚗`;
  }

  /**
   * Generate booking summary for confirmation
   */
  private generateBookingSummary(data: BookingData): string {
    const dateObj = new Date(`${data.date}T${data.time}:00`);
    const dateStr = dateObj.toLocaleString('de-CH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `Perfekt! Hier ist Ihre Terminübersicht:

📅 **Datum:** ${dateStr}
🔧 **Service:** ${data.serviceType}
👤 **Name:** ${data.customerName}
📞 **Telefon:** ${data.customerPhone}

Bitte klicken Sie auf den Button unten, um Ihren Termin zu bestätigen.`;
  }

  /**
   * Get available time slots for a date
   */
  async getAvailableSlots(dateStr: string): Promise<{ slots: string[]; date: string }> {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();

    // Check if it's a work day
    if (!this.businessHours.workDays.includes(dayOfWeek)) {
      return { slots: [], date: dateStr };
    }

    // Generate all possible slots
    const allSlots: string[] = [];
    for (let hour = this.businessHours.start; hour < this.businessHours.end; hour++) {
      allSlots.push(`${String(hour).padStart(2, '0')}:00`);
    }

    // Get existing appointments for this date
    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          not: 'cancelled',
        },
      },
    });

    // Count appointments per hour
    const appointmentsPerHour: Record<string, number> = {};
    for (const apt of existingAppointments) {
      const hour = new Date(apt.date).getHours();
      const timeKey = `${String(hour).padStart(2, '0')}:00`;
      appointmentsPerHour[timeKey] = (appointmentsPerHour[timeKey] || 0) + 1;
    }

    // Filter available slots (max 2 per hour)
    const availableSlots = allSlots.filter(slot => {
      const count = appointmentsPerHour[slot] || 0;
      return count < 2;
    });

    return { slots: availableSlots, date: dateStr };
  }

  /**
   * Get session history
   */
  getSessionHistory(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`Chat session ended: ${sessionId}`);
  }

  /**
   * Cleanup old sessions (older than 24 hours)
   */
  private cleanupOldSessions(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > maxAge) {
        this.sessions.delete(sessionId);
        this.logger.log(`Cleaned up old session: ${sessionId}`);
      }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
