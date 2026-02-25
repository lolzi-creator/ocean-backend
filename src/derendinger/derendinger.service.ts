import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

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
    baseUrl: 'https://d-store.ch',
    authUrl: 'https://d-store.ch/auth-server-ch-ax/oauth/token',
    vinSearchUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/vehicle/search-by-vin',
    securityCheckUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/vin/security-check',
    partListUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/part-list/search',
    multiRefUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/multi-references/search',
    articlesUrl: 'https://d-store.ch/rest-ch-ax/gtmotive/v4/articles',
    erpSyncUrl: 'https://d-store.ch/rest-ch-ax/articles/erp-sync',
    cartAddUrl: 'https://d-store.ch/rest-ch-ax/cart/article/add',
    cartViewUrl: 'https://d-store.ch/rest-ch-ax/cart/view',
    cartRemoveUrl: 'https://d-store.ch/rest-ch-ax/cart/article/remove',
    orderCreateUrl: 'https://d-store.ch/rest-ch-ax/order/v2/create',
    contextUrl: 'https://d-store.ch/rest-ch-ax/context/',
    clientCredentials: 'ZXNob3Atd2ViOnNhZy1lc2hvcC1id3M=',
    username: process.env.DERENDINGER_USERNAME || 'DMS-DDOceancar',
    password: process.env.DERENDINGER_PASSWORD || 'Oceancar008',
    affiliate: 'derendinger-ch',
  };

  // DMS Interface configuration for ordering
  private readonly dmsConfig = {
    // PREPROD environment for testing
    preprodUrl: 'https://connect.preprod.sag.services/dch-ax/',
    preprodAuthUrl: 'https://connect.preprod.sag.services/auth-server-ch-ax/oauth/token',
    // PROD environment
    prodUrl: 'https://www.d-store.ch/dch-ax/',
    prodAuthUrl: 'https://d-store.ch/auth-server-ch-ax/oauth/token',
    // DMS credentials from Derendinger
    companyId: 'derendinger-switzerland',
    companyPassword: '123456@A',
    dmsUsername: 'DMS-DDOceancar',
    customerId: '1234',
    // DMS client credentials (different from shop credentials)
    dmsClientCredentials: 'Y2xvdWQtZG1zLWRlcmVuZGluZ2VyLXN3aXR6ZXJsYW5kOnNhZy1lc2hvcC1id3M=', // cloud-dms-derendinger-switzerland:sag-eshop-bws
    // Webhook URL - will be set dynamically
    webhookBaseUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  };

  // Store pending orders waiting for webhook callback
  private pendingOrders: Map<string, {
    vehicleId: string;
    reference: string;
    articles: any[];
    createdAt: Date;
  }> = new Map();

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
   * Shared API call helper using fetch (replaces curl-based calls)
   */
  private async apiCall(method: string, url: string, body?: any): Promise<any> {
    const token = await this.getToken();

    const opts: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': 'de',
      },
    };

    if (body) {
      opts.body = JSON.stringify(body);
    }

    const response = await fetch(url, opts);
    const text = await response.text();

    if (!response.ok) {
      this.logger.error(`API ${method} ${url} failed: ${response.status} - ${text.substring(0, 500)}`);
      throw new Error(`Derendinger API error: ${response.status}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
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
      
      const curlCmd = `curl -s --max-time 30 -X POST "${this.config.vinSearchUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "User-Agent: Mozilla/5.0" -d '{"vin":"${vin}","estimateId":"${estId}"}'`;
      
      const result = execSync(curlCmd, { 
        encoding: 'utf-8', 
        timeout: 35000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      if (!result || result.trim() === '') {
        this.logger.error('❌ VIN lookup returned empty response');
        return null;
      }
      
      this.logger.log(`📄 VIN response length: ${result.length} chars`);
      this.logger.log(`📄 VIN raw response: ${result.substring(0, 500)}`);
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

      this.logger.warn(`❌ VIN lookup returned no vehicle data. The vehicle may be too old or not in Derendinger's database.`);
      this.logger.warn(`❌ Response: ${JSON.stringify(data)}`);
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
      const curlCmd = `curl -s --max-time 30 -X POST "${this.config.partListUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "User-Agent: Mozilla/5.0" -d '${payloadStr}'`;

      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
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
      const curlCmd = `curl -s --max-time 30 -X POST "${this.config.multiRefUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "User-Agent: Mozilla/5.0" -d '${payloadStr}'`;
      
      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
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
      const curlCmd = `curl -s --max-time 60 -X POST "${this.config.articlesUrl}" -H "Accept: application/json" -H "Accept-Language: de" -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -H "Referer: https://d-store.ch/dch-ax/home" -H "User-Agent: Mozilla/5.0" -d '${payloadStr}'`;
      
      const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 65000, maxBuffer: 50 * 1024 * 1024 });
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
    includePrices?: boolean;
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
      return { vehicle: null, totalArticles: 0, articles: [], error: 'Fahrzeug nicht in der Derendinger-Datenbank gefunden. Möglicherweise ist das Fahrzeug zu alt oder die VIN wird nicht unterstützt.' };
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

    // STEP 6: Get prices via ERP-Sync (optional, enabled by default)
    if (params.includePrices !== false && result.articles?.length > 0) {
      try {
        const priceData = await this.getArticlePrices(result.articles);

        // Merge prices into articles (both display fields and raw article for cart)
        for (const article of result.articles) {
          const erpData = priceData[article.idPim];
          if (erpData) {
            const price = erpData.price?.price;
            article.price = price ? {
              uvpePrice: price.uvpePrice,
              uvpePriceWithVat: price.uvpePriceWithVat,
              oepPrice: price.oepPrice,
              oepPriceWithVat: price.oepPriceWithVat,
              net1Price: price.net1Price,
              net1PriceWithVat: price.net1PriceWithVat,
              discountInPercent: price.discountInPercent,
              grossPrice: price.grossPrice,
              grossPriceWithVat: price.grossPriceWithVat,
              totalGrossPrice: price.totalGrossPrice,
            } : null;

            // Update availability from erp-sync
            const avail = erpData.availabilities?.[0];
            if (avail) {
              article.deliveryInfo = avail.sofort
                ? 'Sofort lieferbar'
                : avail.formattedCETArrivalDate || article.deliveryInfo;
              article.availabilityType = avail.sofort ? 'immediate' : 'available';
            }

            // Store full erp data for cart operations
            article.erpData = erpData;

            // Merge ERP data into raw article (Derendinger cart/add requires these)
            if (article._rawArticle) {
              article._rawArticle.price = erpData.price || null;
              article._rawArticle.stock = erpData.stock || article._rawArticle.stock;
              article._rawArticle.totalAxStock = erpData.totalAxStock ?? article._rawArticle.totalAxStock;
              article._rawArticle.deliverableStocks = erpData.deliverableStocks || article._rawArticle.deliverableStocks;
              article._rawArticle.availabilities = erpData.availabilities || [];
              article._rawArticle.expressDeliveryFees = erpData.expressDeliveryFees || [];
              article._rawArticle.deliverableStock = erpData.deliverableStock ?? article._rawArticle.deliverableStock ?? 0;
              article._rawArticle.availRequested = true;
            }
          }
        }

        this.logger.log(`💰 Prices merged for ${Object.keys(priceData).length} articles`);
      } catch (error) {
        this.logger.warn(`⚠️ ERP-Sync failed, articles returned without prices: ${error}`);
      }
    }

    this.logger.log('');
    this.logger.log(`✅ TOTAL: ${result.totalArticles} articles found!`);
    this.logger.log('🚗 ========== FLOW COMPLETE ==========');
    this.logger.log('');

    return result;
  }

  /**
   * Transform raw Derendinger response to clean format.
   * Preserves _rawArticle + _rawCategory on each article for cart operations,
   * and _rawVehicle on the result for the same reason.
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
              idPim: article.id_pim,
              artid: article.artid,
              artnr: article.artnr,
              articleNumber: article.artnr_display,
              name: article.name || article.freetextDisplayDesc,
              description: article.freetextDisplayDesc || article.product_addon,
              supplier: typeof article.supplier === 'object' ? article.supplier.description : article.supplier,
              brand: article.product_brand,
              stock: stock,
              totalStock: totalStock,
              rawStock: article.stock,
              deliverableStocks: article.deliverableStocks || [],
              availabilityType,
              deliveryInfo,
              price: article.price || null,
              images: (article.images || [])
                .filter((img: any) => img.img_typ === 'image' || img.img_typ === 'image_300')
                .map((img: any) => img.ref),
              category: genArt.genArtId,
              gaId: genArt.gaid,
              gaDesc: genArt.gaDesc,
              categoryName: article.genArtTxts?.[0]?.gatxtdech || article.name,
              cupiCode: category.cupiCode,
              oeNumbers: article.oeNumbers || {},
              criteria: (article.criteria || [])
                .map((c: any) => ({ name: c.cn, value: c.cvp }))
                .filter((c: any) => c.name),
              salesQuantity: article.salesQuantity || 1,
              amountNumber: article.amountNumber || 1,
              allowedAddToShoppingCart: article.allowedAddToShoppingCart,
              // Preserve full raw article for cart/add (Derendinger requires the complete object)
              _rawArticle: article,
              _rawCategory: {
                gaId: (article.combinedGenArtIds || [genArt.genArtId]).join(','),
                gaDesc: article.genArtTxts?.[0]?.gatxtdech || article.name || '',
                rootDesc: category.rootDescription || category.cupiDescription || '',
              },
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
      // Preserve raw vehicle for cart/add operations
      _rawVehicle: vehicleData || null,
      totalArticles: articles.length,
      articles,
    };
  }

  // ==================== STEP 6: ERP-SYNC (PRICES + AVAILABILITY) ====================

  /**
   * STEP 6: Get prices and availability for articles via ERP-Sync
   * Uses the 2-step approach: stock first, then prices+availability
   *
   * @param articles - Array of articles from searchArticles (need idPim, stock, totalAxStock, deliverableStocks)
   * @returns Map of idPim -> { price, availabilities, stock, totalAxStock, deliverableStocks }
   */
  async getArticlePrices(articles: {
    idPim: string;
    salesQuantity?: number;
    stock?: any;
    totalAxStock?: number;
    deliverableStocks?: any[];
  }[]): Promise<Record<string, any>> {
    this.logger.log(`💰 STEP 6: ERP-Sync for ${articles.length} articles...`);

    if (!articles.length) return {};

    // Single call: get stock + prices + availability at once
    const result = await this.apiCall('POST', this.config.erpSyncUrl, {
      articleInformationRequestItems: articles.map(a => ({
        idPim: a.idPim,
        quantity: a.salesQuantity || 1,
        stock: null,
        totalAxStock: 0,
        deliverableStocks: [],
      })),
      numberOfRequestedItems: articles.length,
      erpInfoRequest: {
        stockRequested: true,
        availabilityRequested: true,
        priceRequested: true,
      },
    });

    const items = result.items || {};
    this.logger.log(`✅ Prices returned for ${Object.keys(items).length} articles`);

    return items;
  }

  // ==================== STEP 7-9: CART OPERATIONS ====================

  /**
   * STEP 7: Add an article to the Derendinger shopping cart.
   *
   * Derendinger requires the FULL raw article object from search results
   * (with ERP-synced price/stock/availabilities merged in), plus the full
   * raw vehicle object. Sending a stripped-down version returns 500.
   *
   * @param rawArticle  - The complete raw article object (_rawArticle from search results)
   * @param rawCategory - Category info { gaId, gaDesc, rootDesc } (_rawCategory from search results)
   * @param rawVehicle  - The complete raw vehicle object (_rawVehicle from search results)
   * @param quantity    - Number of items to add (default 1)
   */
  async addToCart(
    rawArticle: any,
    rawCategory: any,
    rawVehicle: any,
    quantity?: number,
  ): Promise<any> {
    const brand = rawArticle?.product_brand || rawArticle?.brand || '';
    const artNr = rawArticle?.artnr_display || rawArticle?.artnr || '';
    this.logger.log(`🛒 STEP 7: Adding to cart: ${brand} ${artNr}`);

    const payload = {
      category: {
        gaId: rawCategory?.gaId || '',
        gaDesc: rawCategory?.gaDesc || '',
        rootDesc: rawCategory?.rootDesc || '',
      },
      article: rawArticle,
      vehicle: rawVehicle || null,
      quantity: quantity || rawArticle?.salesQuantity || 1,
      basketItemSourceId: '',
      basketItemSourceDesc: '',
    };

    const result = await this.apiCall(
      'POST',
      `${this.config.cartAddUrl}?shopType=DEFAULT_SHOPPING_CART`,
      payload,
    );

    this.logger.log(`✅ Cart items: ${result.numberOfItems || result.items?.length || 0}`);
    return result;
  }

  /**
   * STEP 8: View the Derendinger shopping cart
   */
  async viewCart(): Promise<any> {
    this.logger.log('🛒 STEP 8: Viewing cart...');

    const result = await this.apiCall(
      'GET',
      `${this.config.cartViewUrl}?shopType=DEFAULT_SHOPPING_CART`,
    );

    this.logger.log(`✅ Cart: ${result.numberOfItems || result.items?.length || 0} items`);
    return result;
  }

  /**
   * STEP 9: Remove items from the Derendinger shopping cart
   */
  async removeFromCart(cartKeys: string[]): Promise<any> {
    this.logger.log(`🗑️ STEP 9: Removing ${cartKeys.length} items from cart...`);

    const result = await this.apiCall(
      'POST',
      `${this.config.cartRemoveUrl}?shopType=DEFAULT_SHOPPING_CART`,
      {
        cartKeys,
        reloadAvail: true,
        isRemoveItemInShoppingBasket: true,
      },
    );

    this.logger.log(`✅ Remaining items: ${result.numberOfItems || result.items?.length || 0}`);
    return result;
  }

  // ==================== STEP 10: ORDER PLACEMENT ====================

  /**
   * STEP 10a: Get the shopping basket context (order conditions)
   * Returns payment, delivery, invoice settings from the Derendinger account.
   * Calls context/init first to ensure context is populated.
   */
  async getOrderContext(): Promise<any> {
    this.logger.log('📋 Getting order context...');

    // Initialize context first (required before context data is available)
    try {
      await this.apiCall(
        'POST',
        `${this.config.baseUrl}/rest-ch-ax/context/init`,
        {},
      );
    } catch {
      this.logger.warn('⚠️ Context init call failed, continuing...');
    }

    const context = await this.apiCall('GET', this.config.contextUrl);

    // Parse eshopBasketContext (may be string or object)
    let basketCtx = context.eshopBasketContext;
    if (typeof basketCtx === 'string') {
      try {
        basketCtx = JSON.parse(basketCtx);
      } catch {
        basketCtx = null;
      }
    }

    // If context is not available, return defaults based on account settings
    if (!basketCtx || !basketCtx.deliveryType) {
      this.logger.log(
        '📋 Using default order context (context API returned empty)',
      );
      return {
        invoiceType: { descCode: 'WEEKLY_INVOICE' },
        paymentMethod: { descCode: 'CREDIT' },
        deliveryType: { descCode: 'PICKUP' },
        collectionDelivery: { descCode: 'COLLECTIVE_DELIVERY1' },
        pickupBranch: { branchId: '2501' },
        billingAddress: null,
        deliveryAddress: null,
      };
    }

    this.logger.log(
      `✅ Context: ${basketCtx.deliveryType?.descCode}, ${basketCtx.paymentMethod?.descCode}, branch ${basketCtx.pickupBranch?.branchId}`,
    );
    return basketCtx;
  }

  /**
   * STEP 10b: Place an order with everything currently in the cart
   *
   * Flow: items must already be in cart (via addToCart).
   * This method:
   * 1. Gets the cart to find cartKeys
   * 2. Gets the order context (payment/delivery settings)
   * 3. Calls order/v2/create
   *
   * @param options.reference - Reference text shown on invoice/delivery note (max 60 chars)
   * @param options.message - Message to branch (max 200 chars, triggers manual review)
   */
  async createOrder(options?: {
    reference?: string;
    message?: string;
  }): Promise<{
    success: boolean;
    orderNumber?: string;
    deliveryType?: string;
    orders?: any[];
    error?: string;
  }> {
    this.logger.log('🛒 STEP 10: Placing order...');

    try {
      // 1. Verify cart has items before ordering
      const cart = await this.viewCart();
      const items = cart.items || [];

      if (items.length === 0) {
        return { success: false, error: 'Cart is empty - add items before ordering' };
      }

      this.logger.log(`   Cart has ${items.length} items`);

      // 2. Get order context (payment/delivery/invoice settings)
      const ctx = await this.getOrderContext();

      // 3. Build order condition from context
      const orderCondition: any = {
        invoiceTypeCode: ctx.invoiceType?.descCode || 'WEEKLY_INVOICE',
        paymentMethod: ctx.paymentMethod?.descCode || 'CREDIT',
        deliveryTypeCode: ctx.deliveryType?.descCode || 'PICKUP',
        collectiveDeliveryCode:
          ctx.collectionDelivery?.descCode || 'COLLECTIVE_DELIVERY1',
        pickupBranchId: ctx.pickupBranch?.branchId || '2501',
        billingAddressId: ctx.billingAddress?.addressId || '000838677',
        deliveryAddressId: ctx.deliveryAddress?.addressId || '000838677',
      };

      // 4. Build order request — items must be empty array,
      // the server uses items already in the cart
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const requestDateTime = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const orderRequest = {
        orderCondition,
        timezone: 'Europe/Zurich',
        customerRefText: (options?.reference || '').substring(0, 60),
        message: (options?.message || '').substring(0, 200),
        personalNumber: '',
        finalCustomer: null,
        finalCustomerOrderId: null,
        items: [],
        requestDateTime,
        nonAvailablePromotionMessages: [],
      };

      this.logger.log(
        `   Order: ${items.length} cart items, delivery=${orderCondition.deliveryTypeCode}, payment=${orderCondition.paymentMethod}`,
      );
      this.logger.log(`   Order payload: ${JSON.stringify(orderRequest)}`);

      // 4. Place the order
      const result = await this.apiCall(
        'POST',
        `${this.config.orderCreateUrl}?shopType=DEFAULT_SHOPPING_CART&ksoDisabled=false`,
        orderRequest,
      );

      // Parse response — API returns an array of order objects directly
      // Each object has: orderNr, orderType, subTotalWithNet, vatTotalWithNet, cartKeys, etc.
      const orders = Array.isArray(result) ? result : (result.orders || [result]);
      const orderNumbers: string[] = [];

      for (const order of orders) {
        if (order.orderNr || order.orderNumber) {
          orderNumbers.push(order.orderNr || order.orderNumber);
        }
      }

      this.logger.log(
        `✅ Order placed! Numbers: ${orderNumbers.length > 0 ? orderNumbers.join(', ') : JSON.stringify(result).substring(0, 200)}`,
      );

      return {
        success: true,
        orderNumber: orderNumbers[0] || undefined,
        deliveryType: orderCondition.deliveryTypeCode,
        orders: Array.isArray(orders) ? orders : [result],
      };
    } catch (error) {
      this.logger.error(`❌ Order failed: ${error.message}`);
      return { success: false, error: error.message };
    }
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

  // ==================== DMS INTERFACE METHODS ====================

  /**
   * Generate DMS session token for ordering
   * Uses the DMS credentials to get a special token for the shopping cart transfer
   */
  async getDmsToken(usePreprod = true): Promise<string> {
    this.logger.log('🔐 Getting DMS token for ordering...');
    
    const authUrl = usePreprod 
      ? this.dmsConfig.preprodAuthUrl 
      : this.dmsConfig.prodAuthUrl;
    
    const timestamp = Date.now().toString();
    
    // Build the form data as per Derendinger spec
    const formData = new URLSearchParams({
      username: this.dmsConfig.dmsUsername,
      password: this.config.password, // Same password as shop
      grant_type: 'password',
      scope: 'read write',
      affiliate: this.config.affiliate,
      login_mode: 'NORMAL',
      located_affiliate: this.config.affiliate,
      customer_id: this.dmsConfig.customerId,
    });

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${this.dmsConfig.dmsClientCredentials}`,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`❌ DMS token failed: ${response.status} - ${errorText}`);
        throw new Error(`DMS token request failed: ${response.status}`);
      }

      const tokenData = await response.json();
      this.logger.log(`✅ DMS token obtained successfully`);
      return tokenData.access_token;
    } catch (error) {
      this.logger.error(`❌ DMS token error: ${error}`);
      throw error;
    }
  }

  /**
   * Generate the DMS session URL to open Derendinger shop with pre-filled basket
   * This URL can be opened in a popup/iframe for the user to complete the order
   */
  async generateDmsSessionUrl(params: {
    vehicleId: string;
    articles: { id: string; quantity: number; name?: string }[];
    reference?: string;
    usePreprod?: boolean;
  }): Promise<{ sessionUrl: string; orderId: string }> {
    this.logger.log('🛒 Generating DMS session URL...');
    this.logger.log(`   Articles: ${params.articles.length}`);
    
    const usePreprod = params.usePreprod ?? true; // Default to preprod
    const baseUrl = usePreprod ? this.dmsConfig.preprodUrl : this.dmsConfig.prodUrl;
    
    // Generate a unique order ID for tracking
    const orderId = crypto.randomUUID();
    
    // Get the DMS token
    const dmsToken = await this.getDmsToken(usePreprod);
    
    // Build article IDs and quantities (semicolon separated)
    const articleIds = params.articles.map(a => a.id).join(';');
    const quantities = params.articles.map(a => a.quantity.toString()).join(';');
    
    // Build the webhook URL that Derendinger will call when order is completed
    const webhookUrl = `${this.dmsConfig.webhookBaseUrl}/derendinger/webhook/${orderId}`;
    
    // Reference for the order (will be shown in Derendinger)
    const reference = params.reference || params.vehicleId;
    
    // Store pending order for webhook callback
    this.pendingOrders.set(orderId, {
      vehicleId: params.vehicleId,
      reference: reference,
      articles: params.articles,
      createdAt: new Date(),
    });
    
    // Build URL parameters as per Derendinger spec
    const urlParams = new URLSearchParams({
      U: this.dmsConfig.dmsUsername,
      A: this.config.affiliate,
      P1: '', // Empty for auto-redirect
      P4: '', // Empty for default
      P5: articleIds, // Article IDs
      P6: quantities, // Quantities
      R: reference, // Reference/Referenz
      HOOK_URL: webhookUrl, // Callback URL
      T: dmsToken, // JWT token
    });
    
    const sessionUrl = `${baseUrl}openSession?${urlParams.toString()}`;
    
    this.logger.log(`✅ DMS session URL generated`);
    this.logger.log(`   Order ID: ${orderId}`);
    this.logger.log(`   Webhook URL: ${webhookUrl}`);
    
    return { sessionUrl, orderId };
  }

  /**
   * Handle webhook callback from Derendinger when order is completed/cancelled
   */
  async handleWebhook(orderId: string, data: any): Promise<{
    success: boolean;
    order?: any;
    error?: string;
  }> {
    this.logger.log(`📨 Webhook received for order: ${orderId}`);
    this.logger.log(`   Data: ${JSON.stringify(data).substring(0, 200)}...`);
    
    const pendingOrder = this.pendingOrders.get(orderId);
    
    if (!pendingOrder) {
      this.logger.warn(`⚠️ No pending order found for ID: ${orderId}`);
      return { 
        success: false, 
        error: 'Order not found or already processed' 
      };
    }
    
    // Parse the webhook data
    // The exact format depends on what Derendinger sends back
    const orderResult = {
      orderId,
      vehicleId: pendingOrder.vehicleId,
      reference: pendingOrder.reference,
      articles: pendingOrder.articles,
      status: data.status || 'completed',
      derendingerOrderId: data.orderNumber || data.orderId,
      totalAmount: data.totalAmount,
      orderDate: new Date(),
      webhookData: data,
    };
    
    // Remove from pending orders
    this.pendingOrders.delete(orderId);
    
    this.logger.log(`✅ Order processed: ${orderResult.derendingerOrderId || 'N/A'}`);
    
    return {
      success: true,
      order: orderResult,
    };
  }

  /**
   * Get status of a pending order
   */
  getPendingOrder(orderId: string) {
    return this.pendingOrders.get(orderId);
  }

  /**
   * Clean up old pending orders (older than 24 hours)
   */
  cleanupPendingOrders() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const [orderId, order] of this.pendingOrders.entries()) {
      if (order.createdAt < oneDayAgo) {
        this.pendingOrders.delete(orderId);
        this.logger.log(`🧹 Cleaned up old pending order: ${orderId}`);
      }
    }
  }
}
