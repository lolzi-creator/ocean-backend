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
                text: `Analyze this Swiss vehicle registration document (Fahrzeugausweis) and extract ALL vehicle and owner information:

1. VIN (Fahrgestell-Nr./Chassis no.) - Field 23, exactly 17 alphanumeric characters WITHOUT spaces
2. Customer name (Halter/Eigentümer) - Field 01-06, "Name, Vornamen" section. Extract ONLY the name (person or company name), NOT the address. Stop at the first address element (street name, house number, postal code, city). Examples: "Max Mustermann" or "Carrosserie G&G AG" (NOT "Carrosserie G&G AG Freiburgstrasse 583...")
3. Customer address (optional) - Field 01-06, extract the full address if visible (street, number, postal code, city)
4. Brand (Marke) - Field 21 "Marke und Typ", extract the brand name (e.g., "Mitsubishi" from "Mitsubishi Colt 1300")
5. Model (Typ) - Field 21 "Marke und Typ", extract the model (e.g., "Colt 1300" from "Mitsubishi Colt 1300")
6. Year - Field 36 "1. Inverkehrsetzung", extract the year (e.g., "1988" from "01.05.1988")
7. Color (Farbe) - Field 26, extract the color name (e.g., "rot", "weiss", "schwarz")
8. License Plate (Schild) - Field 15, extract the full license plate including canton code and number (e.g., "BE 743894" or "ZH 123456")
9. Body Type (Karosserie) - Field 25, extract body type (e.g., "Limousine", "Kombi", "Coupe", "Stationswagen")
10. Engine (Hubraum) - Field 37, extract engine capacity (e.g., "1298" from "1'298 cm³" or "1298 cm³")
11. Power (Leistung) - Field 76, extract power (e.g., "49" from "49 kW" or "49 kW")

Return your response in JSON format only:
{
  "vin": "JMBMNC11AJU405125",
  "customerName": "Max Mustermann",
  "customerAddress": "Freiburgstrasse 583, 3172 Niederwangen b. Bern",
  "brand": "Mitsubishi",
  "model": "Colt 1300",
  "year": "1988",
  "color": "rot",
  "licensePlate": "ZH 123456",
  "bodyType": "Limousine",
  "engine": "1298",
  "power": "49"
}

Important: 
- VIN must be exactly 17 characters with NO spaces (remove all spaces)
- Customer name: Extract ONLY the name, stop before any address information (street names, numbers, postal codes)
- Customer address: Full address if visible, otherwise empty string
- License plate: Include both canton code AND number if visible (e.g., "BE 743894")
- Year should be just the year number (e.g., "1988" not "01.05.1988")
- Engine should be just the number without units (e.g., "1298" not "1'298 cm³")
- Power should be just the number without units (e.g., "49" not "49 kW")
- If you cannot find a value, use an empty string ""
- Only return valid JSON, nothing else.`,
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
        const validVin = vin.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : '';

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

