import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';

interface DerendingerToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  located_affiliate: string;
  jti: string;
  expiresAt?: number;
}

interface VehicleData {
  umc: string;
  equipmentItems: string[];
  equipmentRanks: { value: string; family: string; subFamily: string }[];
  makeCode: string;
  vehicleId: string;
  timestamp: number;
}

export interface PartCode {
  partCode: string;
  functionalGroup?: string;
  name?: string;
}

interface ArticleSearchParams {
  vin: string;
  vehicleId?: string;
  makeCode?: string;
  partCodes: PartCode[];  // Required: list of part codes to search
  estimateId?: string;
}

@Injectable()
export class DerendingerService {
  private readonly logger = new Logger(DerendingerService.name);
  
  private cachedToken: DerendingerToken | null = null;
  private vehicleCache: Map<string, VehicleData> = new Map();

  private readonly config = {
    authUrl: 'https://d-store.ch/auth-server-ch-ax/oauth/token',
    vinSearchUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/vehicle/search-by-vin',
    partListUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/part-list/search',
    multiRefUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/multi-references/search',
    articlesUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/v4/articles',
    clientCredentials: 'ZXNob3Atd2ViOnNhZy1lc2hvcC1id3M=',
    username: process.env.DERENDINGER_USERNAME || 'DMS-DDOceancar',
    password: process.env.DERENDINGER_PASSWORD || 'Oceancar008',
    affiliate: 'derendinger-ch',
  };

  // Service type to part codes mapping
  // Part codes and functional groups from Derendinger part-list/search
  private readonly servicePartCodes: Record<string, PartCode[]> = {
    small_service: [
      { partCode: '06100', functionalGroup: '61H00', name: 'Ölfilter' },
      { partCode: '06102', functionalGroup: '61H00', name: 'Dichtung Ölfilter' },
    ],
    big_service: [
      { partCode: '06100', functionalGroup: '61H00', name: 'Ölfilter' },
      { partCode: '06102', functionalGroup: '61H00', name: 'Dichtung Ölfilter' },
      { partCode: '10050', functionalGroup: '10H00', name: 'Luftfilter' },
      { partCode: '65900', functionalGroup: '65H00', name: 'Pollenfilter' },
    ],
    brake_service: [
      { partCode: '48800', functionalGroup: '48H00', name: 'Bremsbeläge vorne' },
      { partCode: '49830', functionalGroup: '49H00', name: 'Bremsbeläge hinten' },
    ],
    inspection: [
      { partCode: '06100', functionalGroup: '61H00', name: 'Ölfilter' },
      { partCode: '06102', functionalGroup: '61H00', name: 'Dichtung Ölfilter' },
      { partCode: '10050', functionalGroup: '10H00', name: 'Luftfilter' },
      { partCode: '65900', functionalGroup: '65H00', name: 'Pollenfilter' },
      { partCode: '15300', functionalGroup: '61K00', name: 'Zündkerze' },
    ],
  };

  /**
   * STEP 1: Login to Derendinger
   */
  async login(): Promise<DerendingerToken> {
    this.logger.log('🔐 STEP 1: Logging in to Derendinger...');

    const formData = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
      grant_type: 'password',
      scope: 'read write',
      affiliate: this.config.affiliate,
      login_mode: 'NORMAL',
      located_affiliate: this.config.affiliate,
    });

    const response = await fetch(this.config.authUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${this.config.clientCredentials}`,
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`❌ Login failed: ${response.status} - ${errorText}`);
      throw new Error(`Derendinger login failed: ${response.status}`);
    }

    const tokenData: DerendingerToken = await response.json();
    tokenData.expiresAt = Date.now() + (tokenData.expires_in - 300) * 1000;
    this.cachedToken = tokenData;
    
    this.logger.log(`✅ Login successful. Token expires in ${tokenData.expires_in}s`);
    return tokenData;
  }

  async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.access_token;
    }
    const tokenData = await this.login();
    return tokenData.access_token;
  }

  /**
   * STEP 2: VIN Lookup - Get UMC, equipments, and equipmentRanks
   */
  async lookupVehicleByVin(vin: string, estimateId?: string): Promise<VehicleData | null> {
    // Check cache first (5 min TTL)
    const cached = this.vehicleCache.get(vin);
    if (cached && Date.now() - cached.timestamp < 300000) {
      this.logger.log(`📋 Using cached vehicle data for VIN ${vin}`);
      return cached;
    }

    const token = await this.getToken();
    this.logger.log(`🔍 STEP 2: VIN Lookup for: ${vin}`);

    try {
      const estId = estimateId || '12341767969731190';
      
      const curlCmd = `curl -s -X POST "${this.config.vinSearchUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "X-Client-Dms: false" -H "X-Client-Version: 5.17.8" -d '{"vin":"${vin}","estimateId":"${estId}"}'`;
      
      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 });
      const data = JSON.parse(result);
      
      const gtResponse = data.data?.gtmotiveResponse;
      const vehicle = data.data?.vehicle;
      
      if (gtResponse && gtResponse.umc) {
        const vehicleData: VehicleData = {
          umc: gtResponse.umc,
          equipmentItems: gtResponse.equipmentItems || [],
          equipmentRanks: gtResponse.equipmentRanks || [],
          makeCode: gtResponse.makeCode || vehicle?.id_make?.toString() || 'MB1',
          vehicleId: vehicle?.id || vehicle?.vehid || 'V119604M28178',
          timestamp: Date.now(),
        };
        
        this.vehicleCache.set(vin, vehicleData);
        
        this.logger.log(`✅ Found vehicle: UMC=${vehicleData.umc}, Vehicle ID=${vehicleData.vehicleId}`);
        return vehicleData;
      }
      
      this.logger.warn(`❌ VIN lookup returned no data`);
      return null;
    } catch (error) {
      this.logger.error(`❌ VIN lookup error: ${error}`);
      return null;
    }
  }

  /**
   * STEP 3: Part List Search - Get ALL available parts for this vehicle
   */
  async getVehiclePartsList(vehicleData: VehicleData): Promise<any[]> {
    const token = await this.getToken();
    this.logger.log(`📦 STEP 3: Part List Search for UMC: ${vehicleData.umc}`);

    try {
      const payload = {
        umc: vehicleData.umc,
        equipments: vehicleData.equipmentItems,
        equipmentRanks: vehicleData.equipmentRanks,
      };

      const payloadStr = JSON.stringify(payload).replace(/'/g, "'\\''");
      const curlCmd = `curl -s -X POST "${this.config.partListUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "X-Client-Dms: false" -H "X-Client-Version: 5.17.8" -d '${payloadStr}'`;

      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 });
      const data = JSON.parse(result);

      const parts: any[] = [];
      for (const fg of data.data?.functionalGroups || []) {
        for (const part of fg.parts || []) {
          parts.push({
            partCode: part.partCode,
            partDescription: part.partDescription,
            functionalGroup: fg.functionalGroup,
            functionalGroupDescription: fg.functionalGroupDescription,
          });
        }
      }

      this.logger.log(`✅ Found ${parts.length} available parts for this vehicle`);
      return parts;
    } catch (error) {
      this.logger.error(`❌ Parts list error: ${error}`);
      return [];
    }
  }

  /**
   * STEP 4: Multi-References Search - Get OE references for parts
   */
  async getOeReferences(
    vehicleData: VehicleData,
    partCodes: PartCode[]
  ): Promise<{ reference: string; description: string; cupi: string }[]> {
    const token = await this.getToken();
    
    this.logger.log(`📋 STEP 4: Multi-References Search for ${partCodes.length} parts...`);
    this.logger.log(`   Parts: ${partCodes.map(p => p.partCode).join(', ')}`);

    // Build partSnapshots with functionalGroup format like "10H00", "65H00", etc.
    const partSnapshots = partCodes.map(pc => ({
      functionalGroup: pc.functionalGroup || `${pc.partCode.substring(0, 2)}H00`,
      partCode: pc.partCode,
    }));

    const payload = {
      gtmotiveMultiPartsThreeSearchRequest: {
        umc: vehicleData.umc,
        equipments: vehicleData.equipmentItems,
        equipmentRanks: vehicleData.equipmentRanks,
        partSnapshots: partSnapshots,
      },
      isVinMode: true,
      isMaintenance: false,
    };

    try {
      const payloadStr = JSON.stringify(payload).replace(/'/g, "'\\''");
      const curlCmd = `curl -s -X POST "${this.config.multiRefUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "X-Client-Dms: false" -H "X-Client-Version: 5.17.8" -d '${payloadStr}'`;
      
      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 });
      const data = JSON.parse(result);
      
      const results: { reference: string; description: string; cupi: string }[] = [];

      for (const item of data.data || []) {
        for (const op of item.operations || []) {
          if (op.reference) {
            results.push({
              reference: op.reference,
              description: op.description || '',
              cupi: item.partCode || '',
            });
            this.logger.log(`   ✅ ${item.partCode}: ${op.description} -> ${op.reference}`);
          }
        }
        if (!item.operations?.length) {
          this.logger.log(`   ❌ ${item.partCode}: No OE reference found`);
        }
      }

      this.logger.log(`✅ Found ${results.length} OE references`);
      return results;
    } catch (error) {
      this.logger.error(`❌ Multi-references error: ${error}`);
      return [];
    }
  }

  /**
   * STEP 5: Articles Search - Search for articles using OE references
   */
  async searchArticlesByOeRefs(
    vin: string,
    vehicleId: string,
    makeCode: string,
    operations: { reference: string; description: string; cupi: string }[],
    estimateId?: string
  ): Promise<any> {
    const token = await this.getToken();
    
    this.logger.log(`🛒 STEP 5: Articles Search with ${operations.length} operations...`);

    const payload = {
      makeCode: makeCode,
      operations: operations.map(op => ({
        reference: op.reference,
        description: op.description,
        auxiliarInformation: null,
        supplyType: 'Neu',
        cupi: op.cupi,
        isMaintenance: false,
      })),
      vin: vin,
      estimateId: estimateId || '12341767969731190',
      cupis: [],
      vehicleId: vehicleId,
      partCodes: [],
      selectedCategoryIds: [],
      checkLiquidation: true,
    };

    try {
      const payloadStr = JSON.stringify(payload).replace(/'/g, "'\\''");
      const curlCmd = `curl -s -X POST "${this.config.articlesUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "X-Client-Dms: false" -H "X-Client-Version: 5.17.8" -d '${payloadStr}'`;
      
      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 });
      const data = JSON.parse(result);
      
      return this.transformArticlesResponse(data);
    } catch (error) {
      this.logger.error(`❌ Articles search error: ${error}`);
      throw error;
    }
  }

  /**
   * FULL FLOW: Search articles by VIN and part codes
   * This is the main method that combines all steps
   */
  async searchArticles(params: {
    vin: string;
    partCodes?: PartCode[];
    serviceType?: string;
    estimateId?: string;
  }): Promise<any> {
    this.logger.log('');
    this.logger.log('🚗 ========== DERENDINGER FULL FLOW ==========');
    this.logger.log(`VIN: ${params.vin}`);
    
    // Determine which part codes to search
    let partCodes = params.partCodes || [];
    if (!partCodes.length && params.serviceType) {
      partCodes = this.servicePartCodes[params.serviceType] || [];
      this.logger.log(`Service type: ${params.serviceType} -> ${partCodes.length} parts`);
    }
    
    if (!partCodes.length) {
      this.logger.warn('❌ No part codes specified');
      return { vehicle: null, totalArticles: 0, articles: [] };
    }
    
    this.logger.log(`Parts to search: ${partCodes.map(p => p.name || p.partCode).join(', ')}`);
    this.logger.log('');

    // STEP 1: Login (happens automatically via getToken)
    
    // STEP 2: VIN Lookup
    const vehicleData = await this.lookupVehicleByVin(params.vin, params.estimateId);
    if (!vehicleData) {
      this.logger.error('❌ Could not find vehicle data');
      return { vehicle: null, totalArticles: 0, articles: [] };
    }
    
    // STEP 3: Part List (optional - we already know our part codes)
    // Can be used to validate part codes exist for this vehicle
    
    // STEP 4: Multi-References Search
    const oeReferences = await this.getOeReferences(vehicleData, partCodes);
    if (!oeReferences.length) {
      this.logger.warn('⚠️ No OE references found for any parts');
      return { vehicle: null, totalArticles: 0, articles: [] };
    }
    
    // STEP 5: Articles Search
    const result = await this.searchArticlesByOeRefs(
      params.vin,
      vehicleData.vehicleId,
      vehicleData.makeCode,
      oeReferences,
      params.estimateId
    );
    
    this.logger.log('');
    this.logger.log(`✅ TOTAL: ${result.totalArticles} articles found!`);
    this.logger.log('🚗 ========== FLOW COMPLETE ==========');
    this.logger.log('');
    
    return result;
  }

  /**
   * Transform raw Derendinger response to clean format
   */
  private transformArticlesResponse(data: any): any {
    const articles: any[] = [];
    const articlesData = data.data?.articlesV4 || data.articlesV4;
    const vehicleData = data.data?.vehicle || data.vehicle;
    const seenIds = new Set<string>();  // Deduplicate articles

    if (articlesData?.content) {
      for (const category of articlesData.content) {
        for (const genArt of category.genArts || []) {
          for (const article of genArt.articles || []) {
            // Skip duplicates
            if (seenIds.has(article.id)) continue;
            seenIds.add(article.id);
            
            // Determine delivery availability from stock data
            const stock = typeof article.stock === 'object' ? article.stock?.stock || 0 : article.stock || 0;
            const totalStock = article.totalAxStock || 0;
            
            let deliveryInfo = 'Nicht verfügbar';
            let availabilityType = 'none';
            
            if (stock > 0) {
              deliveryInfo = 'Sofort lieferbar';
              availabilityType = 'immediate';
            } else if (totalStock > 0) {
              deliveryInfo = '2-3 Tage';
              availabilityType = 'available';
            }

            articles.push({
              id: article.id,
              articleNumber: article.artnr_display,
              name: article.name || article.freetextDisplayDesc,
              description: article.freetextDisplayDesc,
              supplier: typeof article.supplier === 'object' ? article.supplier.description : article.supplier,
              brand: article.product_brand,
              stock: stock,
              totalStock: totalStock,
              availabilityType,
              deliveryInfo,
              price: article.price || null,
              images: (article.images || [])
                .filter((img: any) => img.img_typ === 'image' || img.img_typ === 'image_300')
                .map((img: any) => img.ref),
              category: genArt.genArtId,
              categoryName: article.genArtTxts?.[0]?.gatxtdech || article.name,
              oeNumbers: article.oeNumbers || {},
              criteria: (article.criteria || [])
                .map((c: any) => ({ name: c.cn, value: c.cvp }))
                .filter((c: any) => c.name),
              salesQuantity: article.salesQuantity || 1,
              allowedAddToShoppingCart: article.allowedAddToShoppingCart,
            });
          }
        }
      }
    }

    return {
      vehicle: vehicleData ? {
        id: vehicleData.id || vehicleData.vehid,
        brand: vehicleData.vehicle_brand,
        model: vehicleData.vehicle_model,
        description: vehicleData.vehicleInfo,
        engineCode: vehicleData.vehicle_engine_code,
        powerKw: vehicleData.vehicle_power_kw,
        powerHp: vehicleData.vehicle_power_hp,
        fuelType: vehicleData.vehicle_fuel_type,
      } : null,
      totalArticles: articles.length,
      articles,
    };
  }

  /**
   * Get part codes for a service type
   */
  getServicePartCodes(serviceType: string): PartCode[] {
    return this.servicePartCodes[serviceType] || [];
  }

  /**
   * Get all available service types
   */
  getAvailableServiceTypes() {
    return Object.keys(this.servicePartCodes).map(key => ({
      id: key,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      partCodes: this.servicePartCodes[key],
    }));
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ token: string; expiresIn: number }> {
    const token = await this.getToken();
    return {
      token: token.substring(0, 50) + '...',
      expiresIn: this.cachedToken?.expires_in || 0,
    };
  }
}
