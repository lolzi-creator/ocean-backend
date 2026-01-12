# Derendinger Cloud DMS Integration - Analysis & Planning

## Overview
This document analyzes the integration options for Derendinger's Cloud DMS interface to enable automatic parts ordering from your Ocean garage management system.

---

## Current System Context

### What We Have:
1. **Service Packages** (`service-packages.ts`)
   - Predefined service types (small_service, big_service, brake_service, etc.)
   - Each package contains parts/supplies with descriptions, quantities, and prices
   - Currently hardcoded, but comment says "Später werden diese von einer Store-API kommen"

2. **Expenses System**
   - Automatically creates expenses when a service type is selected
   - Categories: `parts`, `supplies`, `labor`, `other`
   - Linked to vehicles

3. **Invoice/Estimate System**
   - Can create estimates and invoices from vehicles
   - Includes expenses (parts) + labor hours
   - Currently uses hardcoded prices from service packages

### Integration Opportunity:
When a vehicle is assigned a service type, we could:
1. **Automatically create a shopping basket** in Derendinger's shop
2. **Map our service package parts** to Derendinger's product catalog
3. **Order parts directly** when creating an estimate/invoice

---

## Derendinger Integration Variants

### Variant 1: GET from Shop (Simple Solution)
**How it works:**
- Your DMS application queries Derendinger's shop to request the shopping basket
- Requires intercepting browser session close to trigger `requestBasket` GET request

**Pros:**
- Simple implementation
- No server required

**Cons:**
- Requires browser session management
- Less automated
- User must manually close browser to trigger order

**Best for:** Offline scenarios, manual workflows

---

### Variant 2: POST to DMS Direct (Recommended for Ocean) ⭐
**How it works:**
- Your Ocean backend sends shopping basket directly to Derendinger's server
- When user clicks "transfer" or "order", basket is sent to your `HOOK_URL`
- Token links the returned basket to your initial request

**Pros:**
- ✅ Fully automated
- ✅ No browser required
- ✅ Perfect for web-based systems like Ocean
- ✅ Real-time integration
- ✅ Can be triggered programmatically from your backend

**Cons:**
- Requires your backend to have a public endpoint (HOOK_URL)
- Need to handle webhook callbacks

**Best for:** Online web applications (like Ocean!)

---

### Variant 3: POST to DMS Relay-server (Complex)
**How it works:**
- Desktop application polls a relay server
- Shopping basket sent to relay server
- Desktop app polls for returned baskets

**Pros:**
- Works for offline desktop apps

**Cons:**
- Most complex
- Requires relay server setup
- Polling overhead

**Best for:** Desktop applications, offline scenarios

---

## Recommended Approach: Variant 2 (POST to DMS Direct)

### Why Variant 2 is Best for Ocean:
1. **Your system is web-based** (NestJS backend + React frontend)
2. **You already have a backend** that can handle webhooks
3. **Fully automated workflow** - no manual browser steps
4. **Real-time integration** - parts can be ordered immediately when service is selected

---

## Implementation Flow (Variant 2)

### Step 1: Create Shopping Basket
When a vehicle gets a service type assigned:

```
User selects service type → 
Ocean backend creates expenses → 
Ocean backend calls Derendinger openSession API → 
Derendinger returns shopping basket URL with token
```

### Step 2: User Reviews/Edits Basket
```
User opens basket URL in browser → 
User can add/remove items → 
User clicks "Transfer" or "Order" button
```

### Step 3: Receive Order Confirmation
```
Derendinger POSTs basket to your HOOK_URL → 
Ocean backend receives order details → 
Ocean backend updates expenses/invoice with ordered parts → 
Order confirmation stored in database
```

---

## Technical Requirements

### 1. Authentication
You need to generate a JWT token for each request:

**Parameters:**
- `CompanyID` = `derendinger-switzerland`
- `CompanyPassword` = `123456@A`
- `username` = `DMS-DDOceancar` (test) → later: actual Connect username
- `customerID` = `1234` (test) → later: actual customer number
- `timestamp` = current timestamp in specified format
- `returnURL` = your callback URL (e.g., `https://your-domain.com/api/derendinger/callback`)

### 2. openSession API Call
**Endpoint:** `https://connect.preprod.sag.services/dch-ax/`

**Parameters:**
- `U` = `DMS-Oceancar` (Derendinger recognizes order origin)
- `A` = `A`
- `P1` = `1`
- `P4` = `1`
- `P5` = `1000483320;1004220615` (product IDs - these need to be mapped from your service packages)
- `P6` = `2;4` (quantities - corresponding to P5)
- `R` = `REF123456` (your reference number - could be vehicle ID or invoice ID)
- `HOOK_URL` = `https://your-domain.com/api/derendinger/webhook` (your callback endpoint)
- `T` = JWT token (generated from authentication)

### 3. Webhook Endpoint (HOOK_URL)
Your backend needs to expose an endpoint that:
- Receives POST request from Derendinger
- Contains shopping basket data
- Links basket to original request using token
- Updates your system (expenses, invoices, order status)

---

## Data Mapping Challenge

### Current State:
Your service packages have **descriptions** like:
- "Motoröl 5W-30 (5L)"
- "Ölfilter"
- "Bremsbeläge Vorderachse"

### Required:
Derendinger needs **product IDs** like:
- `1000483320`
- `1004220615`

### Solution Options:

1. **Manual Mapping Table** (Initial)
   - Create a mapping table in your database
   - Map service package descriptions → Derendinger product IDs
   - Admin can maintain this mapping

2. **Product Search API** (If available)
   - Query Derendinger's API to search for products by description
   - Auto-map based on search results
   - Fallback to manual mapping

3. **Hybrid Approach** (Recommended)
   - Start with manual mapping for common parts
   - Allow users to search/select Derendinger products when creating service packages
   - Store Derendinger product IDs in service packages

---

## Database Schema Changes Needed

### Option 1: Add Derendinger Product ID to Service Packages
```typescript
export interface ServiceArticle {
  description: string;
  quantity: number;
  unitPrice: number;
  category: 'parts' | 'supplies' | 'labor';
  derendingerProductId?: string; // NEW: Derendinger product ID
}
```

### Option 2: Create Mapping Table
```prisma
model DerendingerProductMapping {
  id              String   @id @default(uuid())
  serviceArticle  String   // Description from service package
  derendingerId   String   // Derendinger product ID
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### Option 3: Store Order Information
```prisma
model PartsOrder {
  id              String   @id @default(uuid())
  vehicleId       String
  invoiceId       String?
  derendingerToken String  // Token from openSession
  status          String   // pending, ordered, received, cancelled
  orderData       Json     // Full order data from Derendinger
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Implementation Steps (High-Level)

### Phase 1: Setup & Authentication
1. ✅ Create Derendinger service module in NestJS
2. ✅ Implement JWT token generation
3. ✅ Add environment variables for credentials
4. ✅ Test authentication with PREPROD

### Phase 2: Product Mapping
1. ✅ Create product mapping system (database table or config)
2. ✅ Map existing service package parts to Derendinger IDs
3. ✅ Create admin UI to manage mappings (optional)

### Phase 3: Basket Creation
1. ✅ Implement `openSession` API call
2. ✅ Generate shopping basket from service package
3. ✅ Return basket URL to frontend
4. ✅ Store token/reference in database

### Phase 4: Webhook Handler
1. ✅ Create webhook endpoint (`/api/derendinger/webhook`)
2. ✅ Parse incoming basket data
3. ✅ Link to original vehicle/invoice
4. ✅ Update order status

### Phase 5: Frontend Integration
1. ✅ Add "Order Parts" button to vehicle detail page
2. ✅ Show basket URL (open in new tab)
3. ✅ Display order status
4. ✅ Show order history

---

## Questions to Answer Before Implementation

1. **Product Mapping:**
   - Do you have a Derendinger product catalog?
   - Should we create a manual mapping first?
   - Is there a product search API available?

2. **Workflow:**
   - When should parts be ordered? (immediately on service selection, or when estimate is created?)
   - Should ordering be automatic or require user confirmation?
   - What happens if user edits the basket in Derendinger's shop?

3. **Order Management:**
   - Do you need to track order status (pending, shipped, received)?
   - Should orders be linked to invoices or vehicles?
   - How do you handle partial orders or cancellations?

4. **Environment:**
   - What's your production domain? (needed for HOOK_URL)
   - Do you have SSL certificate? (required for webhooks)
   - Should we use PREPROD for testing first?

---

## Next Steps

1. **Review this analysis** and decide on approach
2. **Get Derendinger product catalog** or documentation on product IDs
3. **Decide on workflow** (when to order, automatic vs manual)
4. **Set up webhook endpoint** (domain, SSL, routing)
5. **Start with Phase 1** (authentication and basic API calls)

---

## Test Credentials (From Email)

**Shop Login:**
- Username: `DMS-DDOceancar`
- Password: `Oceancar008`

**PREPROD:** https://connect.preprod.sag.services/dch-ax/login?redirect=%2Fhome
**PROD:** https://www.d-store.ch/dch-ax/login

**API Credentials:**
- CompanyID: `derendinger-switzerland`
- CompanyPassword: `123456@A`
- username: `DMS-DDOceancar` (test)
- customerID: `1234` (test)

---

## References

- Email from Christian Ambühl (Technical Specialist)
- Three integration variants documented
- Test account provided for PREPROD and PROD
- Documentation files 1-4a mentioned (need to review these)

