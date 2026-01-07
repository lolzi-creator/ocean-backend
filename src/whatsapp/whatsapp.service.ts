import { Injectable, Logger } from '@nestjs/common';
import twilio from 'twilio';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ConversationSession {
  phoneNumber: string;
  messageCount: number;
  lastActivity: Date;
  waitingForFollowUp: boolean;
  completedTask?: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>; // Store conversation history
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private twilioClient: twilio.Twilio;
  private geminiClient: GoogleGenerativeAI;
  private geminiModel: any;
  private sessions: Map<string, ConversationSession> = new Map();
  private processingMessages: Map<string, number> = new Map(); // Track messages being processed: phone -> timestamp

  constructor() {
    // Initialize Twilio client
    // These will come from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
    } else {
      this.logger.warn('Twilio credentials not found. WhatsApp features will be disabled.');
    }

    // Initialize Gemini AI client
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
      this.geminiModel = this.geminiClient.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Using 2.5-flash (balanced) or gemini-2.5-pro (better quality)
    } else {
      this.logger.warn('Gemini API key not found. AI features will be disabled.');
    }
  }

  /**
   * Send a WhatsApp message via Twilio
   */
  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized. Check your credentials.');
    }

    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Sandbox number

    try {
      await this.twilioClient.messages.create({
        from: from,
        to: `whatsapp:${to}`,
        body: message,
      });
      this.logger.log(`Message sent to ${to}: ${message.substring(0, 50)}...`);
    } catch (error) {
      this.logger.error(`Error sending message to ${to}:`, error);
      throw error;
    }
  }


  /**
   * Get or create a conversation session for a phone number
   */
  private getSession(phoneNumber: string): ConversationSession {
    const session = this.sessions.get(phoneNumber);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount++;
      return session;
    }

    const newSession: ConversationSession = {
      phoneNumber,
      messageCount: 1,
      lastActivity: new Date(),
      waitingForFollowUp: false,
      conversationHistory: [],
    };
    this.sessions.set(phoneNumber, newSession);
    return newSession;
  }

  /**
   * Clear old sessions (older than 24 hours)
   */
  private cleanupOldSessions(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [phoneNumber, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > maxAge) {
        this.sessions.delete(phoneNumber);
      }
    }
  }

  /**
   * Mark a task as completed and set waiting for follow-up
   */
  markTaskCompleted(phoneNumber: string, taskType: string): void {
    const session = this.getSession(phoneNumber);
    session.completedTask = taskType;
    session.waitingForFollowUp = true;
  }

  /**
   * Process incoming WhatsApp message with AI
   * Uses Google Gemini AI to generate intelligent responses
   * Handles appointment booking, confirmations, and cancellations
   */
  async processIncomingMessage(
    from: string, 
    messageBody: string, 
    availabilityInfo?: string,
    taskCompleted?: string,
  ): Promise<string> {
    this.logger.log(`Received message from ${from}: ${messageBody}`);

    if (!this.geminiModel) {
      return 'AI service is not configured. Please check your API key.';
    }

    // Prevent duplicate processing within 3 seconds (same phone number)
    const now = Date.now();
    const lastProcessed = this.processingMessages.get(from);
    if (lastProcessed && (now - lastProcessed) < 3000) {
      this.logger.warn(`Duplicate message detected for ${from} within 3 seconds, ignoring`);
      return ''; // Return empty to prevent duplicate response
    }
    
    this.processingMessages.set(from, now);
    
    // Cleanup old entries (older than 10 seconds)
    for (const [phone, timestamp] of this.processingMessages.entries()) {
      if (now - timestamp > 10000) {
        this.processingMessages.delete(phone);
      }
    }

    // Cleanup old sessions periodically
    if (Math.random() < 0.1) { // 10% chance to cleanup
      this.cleanupOldSessions();
    }

    const session = this.getSession(from);

    // If we're waiting for follow-up and user responds
    if (session.waitingForFollowUp) {
      const lower = messageBody.toLowerCase().trim();
      const positiveResponses = ['ja', 'yes', 'gerne', 'bitte', 'ok', 'okay', 'klar', 'sicher'];
      const negativeResponses = ['nein', 'no', 'ne', 'nein danke', 'das war alles', 'das war\'s', 'fertig', 'ende'];
      
      if (positiveResponses.some(r => lower.includes(r))) {
        session.waitingForFollowUp = false;
        session.completedTask = undefined;
      } else if (negativeResponses.some(r => lower.includes(r))) {
        session.waitingForFollowUp = false;
        session.completedTask = undefined;
        session.conversationHistory = []; // Clear history when done
        return 'Gerne! Falls Sie später noch Fragen haben, melden Sie sich einfach. Einen schönen Tag! 👋';
      }
    }

    // Add user message to history
    session.conversationHistory.push({ role: 'user', content: messageBody });

    // Build conversation context - only keep last 10 messages to avoid token limits
    const recentHistory = session.conversationHistory.slice(-10);
    const conversationContext = recentHistory
      .map(msg => `${msg.role === 'user' ? 'Kunde' : 'Assistent'}: ${msg.content}`)
      .join('\n');

    try {
      const systemPrompt = `Du bist ein hilfreicher Kundenbetreuer für Ocean Garage, eine Autowerkstatt.

WICHTIG - STRICTE REGELN:
1. Antworte KURZ (maximal 3-4 Sätze). Keine langen Texte.
2. NIEMALS Fragen wiederholen, die bereits in der Unterhaltung gestellt wurden.
3. Wenn der Kunde bereits Informationen gegeben hat (Datum, Service, Zeit), verwende diese direkt.
4. ${availabilityInfo ? `Verfügbare Zeiten:${availabilityInfo}` : 'Wenn der Kunde nach Terminen fragt UND noch kein Datum/Service genannt hat, frage NUR EINMAL danach.'}
5. Wenn alle Infos vorhanden sind, bestätige den Termin oder frage nach Bestätigung.
6. Antworte auf Deutsch, sei freundlich aber sehr direkt und präzise.`;

      // Build prompt with conversation history
      let fullPrompt = systemPrompt;
      if (conversationContext) {
        fullPrompt += `\n\nVorherige Unterhaltung:\n${conversationContext}\n\nAntworte jetzt:`;
      } else {
        fullPrompt += `\n\nKunde: ${messageBody}\n\nAntworte:`;
      }

      const result = await this.geminiModel.generateContent(fullPrompt);
      let response = result.response.text().trim();
      
      // Remove any duplicate questions or repetitive content
      response = this.removeRepetitiveContent(response);
      
      this.logger.log(`AI response generated: ${response.substring(0, 50)}...`);
      
      // Add follow-up question if task was completed
      if (taskCompleted) {
        this.markTaskCompleted(from, taskCompleted);
        if (!response.toLowerCase().includes('kann ich') && !response.toLowerCase().includes('noch bei')) {
          response += '\n\nKann ich Ihnen noch bei etwas anderem helfen?';
        }
      }
      
      // Add assistant response to history
      session.conversationHistory.push({ role: 'assistant', content: response });
      
      return response;
    } catch (error) {
      this.logger.error('Error generating AI response:', error);
      return 'Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.';
    }
  }

  /**
   * Remove repetitive content from response
   */
  private removeRepetitiveContent(response: string): string {
    // Split into sentences
    const sentences = response.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
    const uniqueSentences: string[] = [];
    const seen = new Set<string>();
    
    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase().trim();
      // Check if we've seen a similar sentence (allowing for small variations)
      const isDuplicate = Array.from(seen).some(seenSentence => {
        const similarity = this.calculateSimilarity(normalized, seenSentence);
        return similarity > 0.8; // 80% similarity threshold
      });
      
      if (!isDuplicate) {
        uniqueSentences.push(sentence);
        seen.add(normalized);
      }
    }
    
    return uniqueSentences.join('. ') + (response.endsWith('.') || response.endsWith('!') || response.endsWith('?') ? '' : '.');
  }

  /**
   * Calculate similarity between two strings (simple word overlap)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

