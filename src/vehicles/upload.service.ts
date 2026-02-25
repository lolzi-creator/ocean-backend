import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UploadService {
  constructor(private supabaseService: SupabaseService) {}

  async uploadPhoto(file: Express.Multer.File, vehicleId: string, type: 'vehicle' | 'document'): Promise<string> {
    if (!file) {
      throw new BadRequestException('Keine Datei hochgeladen');
    }

    // Use admin client for storage operations to bypass RLS
    const supabase = this.supabaseService.getAdminClient();
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${vehicleId}/${type}_${Date.now()}.${fileExt}`;
    const bucket = 'vehicle-photos';

    // Read file buffer if it's from disk storage
    let fileBuffer: Buffer;
    if (file.buffer) {
      fileBuffer = file.buffer;
    } else {
      // If file is on disk, read it
      const fs = require('fs');
      fileBuffer = fs.readFileSync(file.path);
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      // If bucket doesn't exist, try to create it
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        try {
          const { data: bucketData, error: createError } = await supabase.storage.createBucket(bucket, {
            public: true,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          });
          
          if (createError && !createError.message.includes('already exists')) {
            throw new BadRequestException(
              `Bucket konnte nicht erstellt werden. Bitte erstellen Sie den Bucket '${bucket}' manuell im Supabase Dashboard. Fehler: ${createError.message}`
            );
          }
          
          // Retry upload after bucket creation
          const { data: retryData, error: retryError } = await supabase.storage
            .from(bucket)
            .upload(fileName, fileBuffer, {
              contentType: file.mimetype,
              upsert: false,
            });
          
          if (retryError) {
            throw new BadRequestException(`Upload fehlgeschlagen: ${retryError.message}`);
          }
          
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
          return urlData.publicUrl;
        } catch (createErr: any) {
          throw new BadRequestException(
            `Bucket '${bucket}' existiert nicht. Bitte erstellen Sie ihn im Supabase Dashboard unter Storage → New Bucket. Name: ${bucket}, Public: true`
          );
        }
      }
      throw new BadRequestException(`Upload fehlgeschlagen: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  async extractTextFromImage(file: Express.Multer.File): Promise<string> {
    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      // OCR not configured - return empty (graceful fallback)
      return '';
    }

    try {
      const Groq = require('groq-sdk');
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      // Read file buffer
      let imageBuffer: Buffer;
      if (file.buffer) {
        imageBuffer = file.buffer;
      } else {
        const fs = require('fs');
        imageBuffer = fs.readFileSync(file.path);
      }

      // Convert image to base64
      const base64Image = imageBuffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';

      // Use Groq vision model to extract text
      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this Swiss vehicle registration document (Fahrzeugausweis). Return only the raw text content, nothing else. Include all text you can see including labels, values, numbers, and names.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      });

      const extractedText = completion.choices[0]?.message?.content || '';
      return extractedText;
    } catch (error: any) {
      // Log error but don't throw - allow manual entry
      console.error('OCR Error (Groq):', error.message);
      return '';
    }
  }

  async extractVinAndName(file: Express.Multer.File): Promise<{
    vin: string;
    customerName: string;
    customerAddress?: string;
    brand?: string;
    model?: string;
    year?: string;
    color?: string;
    licensePlate?: string;
    bodyType?: string;
    engine?: string;
    power?: string;
  }> {
    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      console.log('[OCR] GROQ_API_KEY not configured - skipping OCR');
      return { vin: '', customerName: '' };
    }
    
    console.log('[OCR] Starting vehicle data extraction with Groq...');

    try {
      const Groq = require('groq-sdk');
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      // Read file buffer
      let imageBuffer: Buffer;
      if (file.buffer) {
        imageBuffer = file.buffer;
      } else {
        const fs = require('fs');
        imageBuffer = fs.readFileSync(file.path);
      }

      // Convert image to base64
      const base64Image = imageBuffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';

      // Use Groq vision model to extract VIN and customer name directly
      const completion = await groq.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this Swiss vehicle registration document (Fahrzeugausweis) and extract ALL vehicle and owner information.

CRITICAL - VIN EXTRACTION (Field 23, "Fahrgestell-Nr." / "Chassis no."):
- The VIN is EXACTLY 17 alphanumeric characters. Remove ALL spaces.
- The VIN appears TWICE on the document (once in the top section, once in the bottom section near "Fahrgestell-Nr."). Cross-check BOTH occurrences to ensure accuracy.
- Pay very careful attention to similar-looking characters: B vs D vs 8, 0 vs O vs Q, 1 vs I vs l, 5 vs S, 2 vs Z.
- VIN NEVER contains letters I, O, or Q.
- The "Stammnummer" field (e.g., "632.502.167") is NOT the VIN - ignore it.
- Mercedes VINs start with WDD, WDB, WDC, WDF, or W1K. BMW starts with WBA, WBS. VW starts with WVW, WV1, WV2.

Other fields to extract:
1. Customer name (Halter/Eigentümer) - Field 01-06, "Name, Vornamen". Extract ONLY the name, NOT the address.
2. Customer address - Field 01-06, the full address (street, number, postal code, city).
3. Brand (Marke) - Field 21 "Marke und Typ", the brand name (e.g., "Mercedes-Benz").
4. Model (Typ) - Field 21, the model (e.g., "C 200 4m").
5. Year - Field 36 "1. Inverkehrsetzung", just the year (e.g., "1991").
6. Color (Farbe) - Field 26.
7. License Plate (Schild) - Field 15, canton code + number (e.g., "BE 442804").
8. Body Type (Karosserie) - Field 25 (e.g., "Limousine").
9. Engine (Hubraum) - Field 37, just the number (e.g., "1998").
10. Power (Leistung) - Field 76, just the number in kW (e.g., "100").

Return ONLY valid JSON:
{
  "vin": "WDD2053431F759027",
  "customerName": "Max Mustermann",
  "customerAddress": "Musterstrasse 1, 3000 Bern",
  "brand": "Mercedes-Benz",
  "model": "C 200 4m",
  "year": "1991",
  "color": "schwarz",
  "licensePlate": "BE 442804",
  "bodyType": "Limousine",
  "engine": "1998",
  "power": "100"
}

Rules:
- VIN: exactly 17 chars, no spaces, no I/O/Q. Double-check every character.
- Customer name: ONLY the name, stop before any address.
- Year: just the 4-digit year.
- Engine/Power: just the number, no units.
- If you cannot find a value, use "".`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '';
      
      console.log('[OCR] Groq response:', responseText);
      
      // Parse JSON response
      try {
        const parsed = JSON.parse(responseText);
        // Remove all spaces from VIN (Swiss documents may have spaces)
        let vin = (parsed.vin || '').toString().trim().toUpperCase().replace(/\s+/g, '');

        // Validate VIN format (17 chars, no I, O, Q)
        let validVin = vin.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : '';

        // VIN checksum validation (position 9 is a check digit)
        if (validVin) {
          const translitMap: Record<string, number> = {
            A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9,
          };
          const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
          let sum = 0;
          for (let i = 0; i < 17; i++) {
            const c = validVin[i];
            const val = c >= '0' && c <= '9' ? parseInt(c) : translitMap[c] || 0;
            sum += val * weights[i];
          }
          const remainder = sum % 11;
          const checkDigit = remainder === 10 ? 'X' : remainder.toString();
          if (validVin[8] !== checkDigit) {
            console.log(`[OCR] VIN checksum FAILED: position 9 is '${validVin[8]}', expected '${checkDigit}'. VIN may have been misread by OCR.`);
          } else {
            console.log(`[OCR] VIN checksum PASSED`);
          }
        }

        // Extract and clean customer name - remove address if included
        let customerName = (parsed.customerName || '').toString().trim();
        // Remove address patterns (street names, postal codes, cities)
        // Common patterns: numbers followed by street names, postal codes (4 digits), city names
        customerName = customerName
          .replace(/\s+\d+\s+[A-ZÄÖÜ][a-zäöüß]+strasse?/i, '') // Remove "123 Streetname"
          .replace(/\s+\d{4}\s+[A-ZÄÖÜ]/i, '') // Remove "1234 City"
          .replace(/\s+[A-ZÄÖÜ][a-zäöüß]+strasse?.*$/i, '') // Remove "Streetname..."
          .replace(/\s+\d{4,}.*$/i, '') // Remove postal codes and everything after
          .trim();
        
          // Customer adress
        const customerAddress = (parsed.customerAddress || '').toString().trim();
        
        // Extract and clean other vehicle data
        const brand = (parsed.brand || '').toString().trim();
        const model = (parsed.model || '').toString().trim();
        const year = (parsed.year || '').toString().trim();
        const color = (parsed.color || '').toString().trim().toLowerCase();
        const licensePlate = (parsed.licensePlate || '').toString().trim().toUpperCase();
        const bodyType = (parsed.bodyType || '').toString().trim();
        const engine = (parsed.engine || '').toString().trim();
        const power = (parsed.power || '').toString().trim();

        // Log for debugging
        if (!validVin && vin) {
          console.log(`[OCR] VIN extraction: Found "${vin}" (length: ${vin.length}), but validation failed`);
        } else if (validVin) {
          console.log(`[OCR] VIN extraction: Successfully extracted "${validVin}"`);
        }
        
        console.log(`[OCR] Extracted data:`, {
          vin: validVin,
          customerName: customerName ? '✓' : '✗',
          brand: brand || '✗',
          model: model || '✗',
          year: year || '✗',
          color: color || '✗',
          licensePlate: licensePlate || '✗',
        });

        return {
          vin: validVin,
          customerName: customerName.substring(0, 100), // Limit length
          customerAddress: customerAddress || undefined,
          brand: brand || undefined,
          model: model || undefined,
          year: year || undefined,
          color: color || undefined,
          licensePlate: licensePlate || undefined,
          bodyType: bodyType || undefined,
          engine: engine || undefined,
          power: power || undefined,
        };
      } catch (parseError) {
        // If JSON parsing fails, try regex extraction as fallback
        console.error('[OCR] JSON parse error:', parseError);
        const fallback = this.extractVinAndNameFromText(responseText);
        return {
          ...fallback,
          brand: undefined,
          model: undefined,
          year: undefined,
          color: undefined,
          licensePlate: undefined,
          bodyType: undefined,
          engine: undefined,
          power: undefined,
        };
      }
    } catch (error: any) {
      // Log error but don't throw - allow manual entry
      console.error('[OCR] Groq API Error:', error.message);
      console.error('[OCR] Error details:', error);
      return { vin: '', customerName: '' };
    }
  }

  private extractVinAndNameFromText(text: string): { vin: string; customerName: string } {
    // Extract VIN (17 alphanumeric characters, may have spaces in Swiss format)
    const vinPatterns = [
      /(?:Fahrgestellnummer|VIN|Chassis|Fahrgestell|Fahrgestell-Nr\.?)[\s:]*([A-HJ-NPR-Z0-9\s]{17,25})/i,
      /([A-HJ-NPR-Z0-9\s]{17,25})/, // VIN with possible spaces (17-25 chars to account for spaces)
    ];

    let vin = '';
    for (const pattern of vinPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Remove all spaces and validate
        vin = match[1].toUpperCase().trim().replace(/\s+/g, '');
        // Validate VIN format (17 chars, no I, O, Q)
        if (vin.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
          break;
        }
      }
    }

    // Extract customer name
    const namePatterns = [
      /(?:Halter|Eigentümer|Halterin|Name|Inhaber)[\s:]*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i,
      /(?:Halter|Eigentümer|Halterin|Name|Inhaber)[\s:]*([A-ZÄÖÜ][^\n\r]{2,30})/i,
    ];

    let customerName = '';
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        customerName = match[1].trim();
        customerName = customerName.replace(/\s+/g, ' ').substring(0, 100);
        if (customerName.length > 2) {
          break;
        }
      }
    }

    return { vin, customerName };
  }

  async uploadPDF(pdfBuffer: Buffer, vehicleId: string, fileName: string): Promise<string> {
    const supabase = this.supabaseService.getAdminClient();
    const bucket = 'vehicle-files';
    const filePath = `${vehicleId}/${fileName}`;

    // Try to upload
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true, // Overwrite if exists
      });

    if (error) {
      // If bucket doesn't exist, try to create it
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        try {
          const { error: createError } = await supabase.storage.createBucket(bucket, {
            public: true,
            fileSizeLimit: 10485760, // 10MB
            allowedMimeTypes: ['application/pdf'],
          });
          
          if (createError && !createError.message.includes('already exists')) {
            throw new BadRequestException(
              `Bucket konnte nicht erstellt werden. Bitte erstellen Sie den Bucket '${bucket}' manuell im Supabase Dashboard. Fehler: ${createError.message}`
            );
          }
          
          // Retry upload after bucket creation
          const { data: retryData, error: retryError } = await supabase.storage
            .from(bucket)
            .upload(filePath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });
          
          if (retryError) {
            throw new BadRequestException(`PDF Upload fehlgeschlagen: ${retryError.message}`);
          }
          
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
          return urlData.publicUrl;
        } catch (createErr: any) {
          throw new BadRequestException(
            `Bucket '${bucket}' existiert nicht. Bitte erstellen Sie ihn im Supabase Dashboard unter Storage → New Bucket. Name: ${bucket}, Public: true`
          );
        }
      }
      throw new BadRequestException(`PDF Upload fehlgeschlagen: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return urlData.publicUrl;
  }
}

