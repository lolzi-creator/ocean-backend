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
    // For now, return empty - we'll integrate OCR later
    // Options: Tesseract.js, Google Vision API, AWS Textract, etc.
    return '';
  }
}

