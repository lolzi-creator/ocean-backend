import { Controller, Get, Post, Body, Query, Param, UseGuards, Res } from '@nestjs/common';
import { DerendingerService } from './derendinger.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

@Controller('derendinger')
export class DerendingerController {
  constructor(private readonly derendingerService: DerendingerService) {}

  /**
   * Login to Derendinger and get token info
   * POST /derendinger/login
   */
  @Post('login')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async searchArticles(
    @Body() body: {
      vin: string;
      partCodes?: { partCode: string; functionalGroup?: string; name?: string }[];
      serviceType?: string;
      estimateId?: string;
      includePrices?: boolean;
    },
  ) {
    const result = await this.derendingerService.searchArticles({
      vin: body.vin,
      partCodes: body.partCodes,
      serviceType: body.serviceType,
      estimateId: body.estimateId,
      includePrices: body.includePrices,
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

  // ==================== PRICING ENDPOINTS ====================

  /**
   * Get prices for specific articles by their PIM IDs
   * POST /derendinger/articles/prices
   *
   * Body: {
   *   articles: [{
   *     idPim: string,
   *     salesQuantity?: number,
   *     stock?: any,
   *     totalAxStock?: number,
   *     deliverableStocks?: any[]
   *   }]
   * }
   */
  @Post('articles/prices')
  @UseGuards(JwtAuthGuard)
  async getArticlePrices(
    @Body() body: {
      articles: {
        idPim: string;
        salesQuantity?: number;
        stock?: any;
        totalAxStock?: number;
        deliverableStocks?: any[];
      }[];
    },
  ) {
    const prices = await this.derendingerService.getArticlePrices(body.articles);
    return {
      success: true,
      data: prices,
    };
  }

  // ==================== CART ENDPOINTS ====================

  /**
   * Add article to Derendinger cart
   * POST /derendinger/cart/add
   *
   * Requires the full raw article data from search results (with ERP prices merged).
   * The Derendinger API rejects stripped-down payloads.
   *
   * Body: {
   *   rawArticle: object,    // Full _rawArticle from articles/search response
   *   rawCategory: object,   // Full _rawCategory from articles/search response
   *   rawVehicle?: object,   // Full _rawVehicle from articles/search response
   *   quantity?: number       // Quantity to add (default 1)
   * }
   */
  @Post('cart/add')
  @UseGuards(JwtAuthGuard)
  async addToCart(
    @Body() body: {
      rawArticle: any;
      rawCategory: any;
      rawVehicle?: any;
      quantity?: number;
    },
  ) {
    const result = await this.derendingerService.addToCart(
      body.rawArticle,
      body.rawCategory,
      body.rawVehicle,
      body.quantity,
    );
    return {
      success: true,
      data: result,
    };
  }

  /**
   * View Derendinger shopping cart
   * GET /derendinger/cart
   */
  @Get('cart')
  @UseGuards(JwtAuthGuard)
  async viewCart() {
    const result = await this.derendingerService.viewCart();
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Remove items from Derendinger cart
   * POST /derendinger/cart/remove
   *
   * Body: { cartKeys: string[] }
   */
  @Post('cart/remove')
  @UseGuards(JwtAuthGuard)
  async removeFromCart(@Body() body: { cartKeys: string[] }) {
    const result = await this.derendingerService.removeFromCart(body.cartKeys);
    return {
      success: true,
      data: result,
    };
  }

  // ==================== ORDER PLACEMENT ====================

  /**
   * Place an order for all items currently in the Derendinger cart
   * POST /derendinger/order/place
   *
   * Body: {
   *   reference?: string,    // Reference text for invoice/delivery note (max 60 chars)
   *   message?: string       // Message to branch (max 200 chars, triggers manual review)
   * }
   *
   * Items must already be in the cart (via POST /derendinger/cart/add).
   * Uses the account's default payment/delivery settings.
   */
  @Post('order/place')
  @UseGuards(JwtAuthGuard)
  async placeOrder(
    @Body() body: { reference?: string; message?: string },
  ) {
    const result = await this.derendingerService.createOrder({
      reference: body.reference,
      message: body.message,
    });
    return result;
  }

  /**
   * Get the current order context (payment/delivery/invoice settings)
   * GET /derendinger/order/context
   */
  @Get('order/context')
  @UseGuards(JwtAuthGuard)
  async getOrderContext() {
    const context = await this.derendingerService.getOrderContext();
    return {
      success: true,
      data: {
        invoiceType: context.invoiceType,
        paymentMethod: context.paymentMethod,
        deliveryType: context.deliveryType,
        collectionDelivery: context.collectionDelivery,
        pickupBranch: context.pickupBranch,
        billingAddress: context.billingAddress,
        deliveryAddress: context.deliveryAddress,
      },
    };
  }

  // ==================== DMS INTERFACE ENDPOINTS ====================

  /**
   * Generate DMS session URL to open Derendinger shop with pre-filled basket
   * POST /derendinger/order/create-session
   * 
   * Body: {
   *   vehicleId: string,           // Internal vehicle ID
   *   articles: [{                 // Articles to order
   *     id: string,                // Derendinger article ID
   *     quantity: number,          // Quantity to order
   *     name?: string              // Article name (for reference)
   *   }],
   *   reference?: string,          // Custom reference (defaults to vehicleId)
   *   usePreprod?: boolean         // Use preprod environment (default: true)
   * }
   * 
   * Returns:
   * {
   *   success: true,
   *   sessionUrl: string,          // URL to open in popup/iframe
   *   orderId: string              // Internal order ID for tracking
   * }
   */
  @Post('order/create-session')
  @UseGuards(JwtAuthGuard)
  async createOrderSession(
    @Body() body: {
      vehicleId: string;
      articles: { id: string; quantity: number; name?: string }[];
      reference?: string;
      usePreprod?: boolean;
    },
  ) {
    try {
      const result = await this.derendingerService.generateDmsSessionUrl({
        vehicleId: body.vehicleId,
        articles: body.articles,
        reference: body.reference,
        usePreprod: body.usePreprod,
      });

      return {
        success: true,
        sessionUrl: result.sessionUrl,
        orderId: result.orderId,
        message: 'Open sessionUrl in a popup to complete the order',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create order session',
        error: error.message,
      };
    }
  }

  /**
   * Get status of a pending order
   * GET /derendinger/order/:orderId/status
   */
  @Get('order/:orderId/status')
  @UseGuards(JwtAuthGuard)
  async getOrderStatus(@Param('orderId') orderId: string) {
    const pendingOrder = this.derendingerService.getPendingOrder(orderId);
    
    if (!pendingOrder) {
      return {
        success: false,
        message: 'Order not found or already completed',
      };
    }

    return {
      success: true,
      order: {
        orderId,
        vehicleId: pendingOrder.vehicleId,
        reference: pendingOrder.reference,
        articles: pendingOrder.articles,
        createdAt: pendingOrder.createdAt,
        status: 'pending',
      },
    };
  }

  /**
   * Webhook endpoint called by Derendinger when order is completed
   * GET or POST /derendinger/webhook/:orderId
   * 
   * NOTE: This endpoint is NOT protected by JwtAuthGuard because
   * Derendinger's server will call it directly
   */
  @Get('webhook/:orderId')
  async webhookGet(
    @Param('orderId') orderId: string,
    @Query() query: any,
    @Res() res: Response,
  ) {
    console.log('📨 Webhook GET received:', orderId, query);
    
    const result = await this.derendingerService.handleWebhook(orderId, query);
    
    // Redirect to a success/failure page or return JSON
    if (result.success) {
      // Return a simple HTML page that closes the popup
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Bestellung erfolgreich</title></head>
          <body>
            <h2>✅ Bestellung erfolgreich übermittelt!</h2>
            <p>Sie können dieses Fenster jetzt schliessen.</p>
            <script>
              // Notify parent window
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'DERENDINGER_ORDER_COMPLETE', 
                  orderId: '${orderId}',
                  success: true 
                }, '*');
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Fehler</title></head>
          <body>
            <h2>❌ Fehler bei der Bestellung</h2>
            <p>${result.error}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'DERENDINGER_ORDER_COMPLETE', 
                  orderId: '${orderId}',
                  success: false,
                  error: '${result.error}'
                }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }
  }

  @Post('webhook/:orderId')
  async webhookPost(
    @Param('orderId') orderId: string,
    @Body() body: any,
    @Query() query: any,
    @Res() res: Response,
  ) {
    console.log('📨 Webhook POST received:', orderId, body, query);
    
    // Combine body and query params
    const data = { ...query, ...body };
    const result = await this.derendingerService.handleWebhook(orderId, data);
    
    res.json(result);
  }

  /**
   * Test the DMS session URL generation (preprod)
   * POST /derendinger/order/test
   * 
   * For testing purposes - creates a session with dummy articles
   */
  @Post('order/test')
  @UseGuards(JwtAuthGuard)
  async testOrderSession(@Body() body: { vehicleId?: string }) {
    try {
      // Use dummy test articles
      const testArticles = [
        { id: '1000014766', quantity: 1, name: 'Test Ölfilter' },
      ];

      const result = await this.derendingerService.generateDmsSessionUrl({
        vehicleId: body.vehicleId || 'test-vehicle',
        articles: testArticles,
        reference: 'TEST-ORDER',
        usePreprod: true, // Always use preprod for testing
      });

      return {
        success: true,
        message: 'Test session created. Open sessionUrl in browser to test ordering.',
        sessionUrl: result.sessionUrl,
        orderId: result.orderId,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create test session',
        error: error.message,
      };
    }
  }
}
