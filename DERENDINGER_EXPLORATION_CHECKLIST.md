# Derendinger DMS Exploration Checklist

## Login Credentials

**PREPROD (Testing):**
- URL: https://connect.preprod.sag.services/dch-ax/login?redirect=%2Fhome
- Username: `DMS-DDOceancar`
- Password: `Oceancar008`

**PROD (Production):**
- URL: https://www.d-store.ch/dch-ax/login
- Username: `DMS-DDOceancar`
- Password: `Oceancar008`
- Note: Generated shopping basket cannot be ordered in PROD

---

## What to Explore & Document

### 1. Product Catalog / Search
- [ ] Can you search for products?
- [ ] How do you find product IDs?
- [ ] What information is available for each product? (ID, description, price, availability)
- [ ] Can you browse by category? (filters, oils, brake parts, etc.)
- [ ] Are there product images?
- [ ] How are products organized?

**What we need:** Product IDs for common parts like:
- Motoröl 5W-30 (5L)
- Ölfilter
- Luftfilter
- Bremsbeläge
- etc.

---

### 2. Shopping Basket / Cart
- [ ] How does the shopping basket work?
- [ ] Can you add/remove items?
- [ ] What information is shown in the basket? (product ID, description, quantity, price)
- [ ] Is there a "Transfer" or "Order" button?
- [ ] What happens when you click it?
- [ ] Can you save baskets?
- [ ] Can you modify quantities?

---

### 3. Order Process
- [ ] What's the order flow?
- [ ] Do you need to confirm before ordering?
- [ ] What information is required? (customer details, delivery address, etc.)
- [ ] Can you see order history?
- [ ] What order statuses exist? (pending, confirmed, shipped, etc.)
- [ ] How are orders tracked?

---

### 4. API / Integration Features
- [ ] Is there an API documentation section?
- [ ] Can you see any API endpoints?
- [ ] Are there webhook settings?
- [ ] Can you configure callback URLs?
- [ ] Is there a developer/API section in the interface?

---

### 5. Customer Management
- [ ] How are customers managed?
- [ ] What customer information is stored?
- [ ] Can you see customer ID (needed for API: `customerID = 1234`)?
- [ ] How do you link orders to customers?

---

### 6. Product Information Structure
When you find products, document:
- [ ] Product ID format (e.g., `1000483320`)
- [ ] Product name/description
- [ ] Price
- [ ] Category/type
- [ ] Any vehicle compatibility info (make, model, year)
- [ ] Stock/availability status

---

### 7. Basket URL Structure
If you can create a test basket:
- [ ] What does the basket URL look like?
- [ ] Does it contain a token?
- [ ] What parameters are in the URL?
- [ ] Can you share/bookmark basket URLs?

---

### 8. User Settings / Configuration
- [ ] Are there API settings?
- [ ] Can you configure webhooks?
- [ ] Are there integration options?
- [ ] What user permissions exist?

---

## Screenshots to Take

1. Product search/browse interface
2. Product detail page (showing product ID)
3. Shopping basket view
4. Order/checkout process
5. Any API/integration documentation pages
6. Settings/configuration pages

---

## Questions to Answer

1. **Product IDs:** How do you find the product ID for a specific part? (e.g., "Ölfilter for Toyota Corolla 2020")

2. **Basket Creation:** Can you programmatically create a basket, or must it be done through the web interface?

3. **Order Confirmation:** After ordering, what information is returned? (order number, status, etc.)

4. **Vehicle Compatibility:** Can you search/filter products by vehicle (VIN, make, model, year)?

5. **Pricing:** Are prices fixed or do they vary? (customer-specific pricing?)

6. **Availability:** Can you check stock/availability via the interface?

---

## Test Scenarios to Try

### Scenario 1: Create a Simple Basket
1. Search for "Ölfilter" (oil filter)
2. Add to basket
3. Search for "Motoröl 5W-30"
4. Add to basket
5. View basket
6. Document what you see

### Scenario 2: Test Order Flow
1. Create basket with 2-3 items
2. Click "Order" or "Transfer"
3. See what happens
4. Document the process

### Scenario 3: Check Product Details
1. Find a product
2. Click to see details
3. Document all available information
4. Look for product ID, SKU, or similar identifier

---

## Notes Section

Use this space to document your findings:

### Product IDs Found:
```
Example:
- Motoröl 5W-30 (5L): [ID if found]
- Ölfilter: [ID if found]
- etc.
```

### Basket URL Example:
```
[Paste basket URL here if you can create one]
```

### Order Process Notes:
```
[Document the order flow you observe]
```

### API/Integration Info:
```
[Any API documentation or integration features you find]
```

### Other Observations:
```
[Anything else that might be useful]
```

---

## Next Steps After Exploration

1. **Document findings** in this checklist
2. **Share screenshots** if possible
3. **Identify product IDs** for common service package parts
4. **Understand the order flow** to plan webhook integration
5. **Note any limitations** or requirements

---

## Tips

- Start with PREPROD for testing
- Try to create a basket and see what happens
- Look for any "API" or "Integration" sections in the menu
- Check if there's a help/documentation section
- Try searching for products you use in your service packages
- Note the URL structure - it might reveal API endpoints

