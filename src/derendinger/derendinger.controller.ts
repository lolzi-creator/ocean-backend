import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { DerendingerService } from './derendinger.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('derendinger')
@UseGuards(JwtAuthGuard)
export class DerendingerController {
  constructor(private readonly derendingerService: DerendingerService) {}

  /**
   * Login to Derendinger and get token info
   * POST /derendinger/login
   */
  @Post('login')
  async login() {
    const tokenData = await this.derendingerService.login();
    return {
      success: true,
      message: 'Successfully logged in to Derendinger',
      expiresIn: tokenData.expires_in,
      affiliate: tokenData.located_affiliate,
    };
  }

  /**
   * Search for articles by VIN and part codes
   * POST /derendinger/articles/search
   * 
   * Body: {
   *   vin: string,                    // Required: Vehicle VIN
   *   partCodes?: [{                  // Option 1: Direct part codes
   *     partCode: string,
   *     functionalGroup?: string,
   *     name?: string
   *   }],
   *   serviceType?: string,           // Option 2: Use predefined service type
   *   estimateId?: string
   * }
   * 
   * Example with part codes:
   * {
   *   "vin": "WDD2053431F759027",
   *   "partCodes": [
   *     {"partCode": "06100", "functionalGroup": "61H00", "name": "Ölfilter"},
   *     {"partCode": "10050", "functionalGroup": "10H00", "name": "Luftfilter"}
   *   ]
   * }
   * 
   * Example with service type:
   * {
   *   "vin": "WDD2053431F759027",
   *   "serviceType": "big_service"
   * }
   */
  @Post('articles/search')
  async searchArticles(
    @Body() body: {
      vin: string;
      partCodes?: { partCode: string; functionalGroup?: string; name?: string }[];
      serviceType?: string;
      estimateId?: string;
    },
  ) {
    const result = await this.derendingerService.searchArticles({
      vin: body.vin,
      partCodes: body.partCodes,
      serviceType: body.serviceType,
      estimateId: body.estimateId,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get ALL available parts for a vehicle by VIN
   * GET /derendinger/vehicle-parts?vin=XXX
   * 
   * Returns the full list of parts available for this specific vehicle
   */
  @Get('vehicle-parts')
  async getVehicleParts(@Query('vin') vin: string) {
    // First get vehicle data
    const vehicleData = await this.derendingerService.lookupVehicleByVin(vin);
    
    if (!vehicleData) {
      return {
        success: false,
        message: 'Vehicle not found for this VIN',
      };
    }

    // Get full parts list
    const parts = await this.derendingerService.getVehiclePartsList(vehicleData);
    
    // Group by functional group for easier browsing
    const grouped: Record<string, any[]> = {};
    for (const part of parts) {
      const group = part.functionalGroupDescription || 'Other';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push({
        partCode: part.partCode,
        name: part.partDescription,
        functionalGroup: part.functionalGroup,
      });
    }

    return {
      success: true,
      data: {
        vehicle: {
          umc: vehicleData.umc,
          makeCode: vehicleData.makeCode,
          vehicleId: vehicleData.vehicleId,
        },
        totalParts: parts.length,
        groups: grouped,
      },
    };
  }

  /**
   * Get available service types with their part codes
   * GET /derendinger/service-types
   */
  @Get('service-types')
  getServiceTypes() {
    return {
      success: true,
      data: this.derendingerService.getAvailableServiceTypes(),
    };
  }

  /**
   * Test endpoint to verify connection (uses cached token)
   * GET /derendinger/test
   */
  @Get('test')
  async testConnection() {
    try {
      // Use getToken() instead of login() to use cached token
      const result = await this.derendingerService.testConnection();
      return {
        success: true,
        message: 'Derendinger connection successful!',
        tokenInfo: result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Derendinger connection failed',
        error: error.message,
      };
    }
  }
}
