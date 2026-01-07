# Ocean Backend - API Documentation

## Overview
Complete REST API for a car garage management system built with NestJS, Prisma, and Supabase.

**Base URL:** `http://localhost:3000`

**Authentication:** All endpoints (except auth endpoints) require JWT Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## Table of Contents
1. [Authentication](#authentication)
2. [Users](#users)
3. [Vehicles](#vehicles)
4. [Time Logs](#time-logs)
5. [Invoices](#invoices)
6. [Audit Logs](#audit-logs)

---

## Authentication

### Register
Create a new user account.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "worker@example.com",
  "password": "password123",
  "name": "Max Mustermann",
  "role": "worker"  // optional: "worker" (default) or "admin"
}
```

**Response:**
```json
{
  "message": "Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mail.",
  "user": {
    "id": "uuid",
    "email": "worker@example.com"
  }
}
```

---

### Login
Authenticate and get access token.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "worker@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Anmeldung erfolgreich",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "email": "worker@example.com"
  }
}
```

---

### Logout
Sign out current user.

**Endpoint:** `POST /auth/logout`

**Request Body:**
```json
{
  "access_token": "your_token_here"
}
```

**Response:**
```json
{
  "message": "Abmeldung erfolgreich"
}
```

---

### Reset Password
Send password reset email.

**Endpoint:** `POST /auth/reset-password`

**Request Body:**
```json
{
  "email": "worker@example.com"
}
```

**Response:**
```json
{
  "message": "Passwort-Zurücksetzungs-E-Mail wurde gesendet. Bitte überprüfen Sie Ihre E-Mail."
}
```

---

## Users

### Get All Users
Retrieve all users.

**Endpoint:** `GET /users`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
[
  {
    "id": "uuid",
    "email": "worker@example.com",
    "name": "Max Mustermann",
    "role": "worker",
    "isActive": true,
    "createdAt": "2025-12-22T12:00:00Z",
    "updatedAt": "2025-12-22T12:00:00Z"
  }
]
```

---

### Get User by ID
Retrieve a specific user.

**Endpoint:** `GET /users/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "email": "worker@example.com",
  "name": "Max Mustermann",
  "role": "worker",
  "isActive": true,
  "createdAt": "2025-12-22T12:00:00Z",
  "updatedAt": "2025-12-22T12:00:00Z"
}
```

---

### Update User
Update user information.

**Endpoint:** `PATCH /users/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Max Updated",
  "role": "admin",
  "isActive": false
}
```

**Response:**
```json
{
  "id": "uuid",
  "email": "worker@example.com",
  "name": "Max Updated",
  "role": "admin",
  "isActive": false,
  "createdBy": {
    "id": "uuid",
    "name": "Admin User",
    "email": "admin@example.com"
  },
  "updatedBy": {
    "id": "uuid",
    "name": "Current User",
    "email": "current@example.com"
  }
}
```

---

### Delete User
Delete a user.

**Endpoint:** `DELETE /users/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "email": "worker@example.com"
}
```

---

## Vehicles

### Get All Vehicles
Retrieve all vehicles.

**Endpoint:** `GET /vehicles`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
[
  {
    "id": "uuid",
    "vin": "WBA12345678901234",
    "brand": "BMW",
    "model": "X5",
    "year": 2023,
    "licensePlate": "ZH-123456",
    "workDescription": "Ölwechsel und Inspektion",
    "isActive": true,
    "createdAt": "2025-12-22T12:00:00Z",
    "updatedAt": "2025-12-22T12:00:00Z"
  }
]
```

---

### Get Vehicle by ID
Retrieve a specific vehicle.

**Endpoint:** `GET /vehicles/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "vin": "WBA12345678901234",
  "brand": "BMW",
  "model": "X5",
  "year": 2023,
  "licensePlate": "ZH-123456",
  "workDescription": "Ölwechsel und Inspektion",
  "isActive": true,
  "createdAt": "2025-12-22T12:00:00Z",
  "updatedAt": "2025-12-22T12:00:00Z"
}
```

---

### Decode VIN
Decode vehicle information from VIN using auto.dev API.

**Endpoint:** `GET /vehicles/decode/:vin`

**Headers:** `Authorization: Bearer TOKEN`

**Example:** `GET /vehicles/decode/WP0AF2A99KS165242`

**Response:**
```json
{
  "vin": "WP0AF2A99KS165242",
  "vinValid": true,
  "make": "Porsche",
  "model": "911",
  "year": 2019,
  "trim": "GT3 RS Coupe",
  "body": "Coupe",
  "engine": "4.0, Flat 6 Cylinder Engine",
  "drive": "Rear Wheel Drive",
  "transmission": "Automatic"
}
```

---

### Create Vehicle
Create a new vehicle.

**Endpoint:** `POST /vehicles`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "vin": "WBA12345678901234",
  "brand": "BMW",
  "model": "X5",
  "year": 2023,
  "licensePlate": "ZH-123456",
  "workDescription": "Ölwechsel und Inspektion"
}
```

**Response:**
```json
{
  "id": "uuid",
  "vin": "WBA12345678901234",
  "brand": "BMW",
  "model": "X5",
  "year": 2023,
  "licensePlate": "ZH-123456",
  "workDescription": "Ölwechsel und Inspektion",
  "isActive": true,
  "createdBy": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "updatedBy": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "createdAt": "2025-12-22T12:00:00Z",
  "updatedAt": "2025-12-22T12:00:00Z"
}
```

---

### Update Vehicle
Update vehicle information.

**Endpoint:** `PATCH /vehicles/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "brand": "BMW",
  "model": "X5 M Sport",
  "year": 2023,
  "licensePlate": "ZH-654321",
  "workDescription": "Vollservice",
  "isActive": false
}
```

**Response:**
```json
{
  "id": "uuid",
  "vin": "WBA12345678901234",
  "brand": "BMW",
  "model": "X5 M Sport",
  "year": 2023,
  "licensePlate": "ZH-654321",
  "workDescription": "Vollservice",
  "isActive": false,
  "createdBy": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "updatedBy": {
    "id": "uuid",
    "name": "Current User",
    "email": "current@example.com"
  }
}
```

---

### Delete Vehicle
Delete a vehicle.

**Endpoint:** `DELETE /vehicles/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "vin": "WBA12345678901234"
}
```

---

## Time Logs

### Get All Time Logs
Retrieve time logs with optional filters.

**Endpoint:** `GET /time-logs`

**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
- `userId` (optional): Filter by user ID
- `vehicleId` (optional): Filter by vehicle ID
- `startDate` (optional): Filter from date (ISO 8601 format: `2025-12-01`)
- `endDate` (optional): Filter to date (ISO 8601 format: `2025-12-31`)

**Example:** `GET /time-logs?vehicleId=uuid&startDate=2025-12-01&endDate=2025-12-31`

**Response:**
```json
[
  {
    "id": "uuid",
    "hours": 5.5,
    "notes": "Ölwechsel und Filter gewechselt",
    "user": {
      "id": "uuid",
      "name": "Max Mustermann",
      "email": "max@example.com"
    },
    "vehicle": {
      "id": "uuid",
      "vin": "WBA12345678901234",
      "brand": "BMW",
      "model": "X5",
      "workDescription": "Ölwechsel und Inspektion"
    },
    "createdAt": "2025-12-22T12:00:00Z",
    "updatedAt": "2025-12-22T12:00:00Z"
  }
]
```

---

### Get Total Hours
Calculate total hours worked with filters.

**Endpoint:** `GET /time-logs/total/hours`

**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
- `userId` (optional): Filter by user ID
- `vehicleId` (optional): Filter by vehicle ID
- `startDate` (optional): Filter from date
- `endDate` (optional): Filter to date

**Example:** `GET /time-logs/total/hours?userId=uuid&startDate=2025-12-01`

**Response:**
```json
{
  "totalHours": 45.5,
  "totalEntries": 12
}
```

---

### Get Time Log by ID
Retrieve a specific time log.

**Endpoint:** `GET /time-logs/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "hours": 5.5,
  "notes": "Ölwechsel und Filter gewechselt",
  "user": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "vehicle": {
    "id": "uuid",
    "vin": "WBA12345678901234",
    "brand": "BMW",
    "model": "X5"
  }
}
```

---

### Create Time Log
Log time worked on a vehicle.

**Endpoint:** `POST /time-logs`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "vehicleId": "uuid",
  "hours": 5.5,
  "notes": "Ölwechsel und Filter gewechselt"
}
```

**Response:**
```json
{
  "id": "uuid",
  "hours": 5.5,
  "notes": "Ölwechsel und Filter gewechselt",
  "user": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "vehicle": {
    "id": "uuid",
    "vin": "WBA12345678901234",
    "brand": "BMW",
    "model": "X5",
    "workDescription": "Ölwechsel und Inspektion"
  },
  "createdAt": "2025-12-22T12:00:00Z",
  "updatedAt": "2025-12-22T12:00:00Z"
}
```

---

### Update Time Log
Update time log (fix mistakes).

**Endpoint:** `PATCH /time-logs/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "hours": 6,
  "notes": "Updated: Complete service with brake inspection"
}
```

**Response:**
```json
{
  "id": "uuid",
  "hours": 6,
  "notes": "Updated: Complete service with brake inspection",
  "user": {
    "id": "uuid",
    "name": "Max Mustermann",
    "email": "max@example.com"
  },
  "vehicle": {
    "id": "uuid",
    "vin": "WBA12345678901234",
    "brand": "BMW",
    "model": "X5"
  }
}
```

---

### Delete Time Log
Delete a time log.

**Endpoint:** `DELETE /time-logs/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "hours": 5.5
}
```

---

## Invoices

### Get All Invoices
Retrieve invoices with optional filters.

**Endpoint:** `GET /invoices`

**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
- `vehicleId` (optional): Filter by vehicle ID
- `type` (optional): Filter by type (`estimate` or `invoice`)
- `status` (optional): Filter by status (`draft`, `sent`, `paid`, `cancelled`)

**Example:** `GET /invoices?vehicleId=uuid&status=sent`

**Response:**
```json
[
  {
    "id": "uuid",
    "invoiceNumber": "INV-2025-0001",
    "type": "invoice",
    "status": "sent",
    "customerName": "Max Mustermann",
    "customerEmail": "max@example.com",
    "customerAddress": "Musterstrasse 123, 8000 Zürich",
    "items": [
      {
        "description": "Ölwechsel",
        "quantity": 1,
        "unitPrice": 80,
        "total": 80
      },
      {
        "description": "Ölfilter",
        "quantity": 1,
        "unitPrice": 25,
        "total": 25
      },
      {
        "description": "Arbeitsstunden (5h)",
        "quantity": 5,
        "unitPrice": 120,
        "total": 600
      }
    ],
    "subtotal": 705,
    "taxRate": 7.7,
    "taxAmount": 54.29,
    "total": 759.29,
    "notes": "Zahlung innerhalb 30 Tagen",
    "vehicle": {
      "id": "uuid",
      "vin": "WBA12345678901234",
      "brand": "BMW",
      "model": "X5"
    },
    "createdBy": {
      "id": "uuid",
      "name": "Max Mustermann",
      "email": "max@example.com"
    },
    "createdAt": "2025-12-22T12:00:00Z",
    "updatedAt": "2025-12-22T12:00:00Z"
  }
]
```

---

### Get Invoice by ID
Retrieve a specific invoice.

**Endpoint:** `GET /invoices/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2025-0001",
  "type": "invoice",
  "status": "sent",
  "customerName": "Max Mustermann",
  "customerEmail": "max@example.com",
  "customerAddress": "Musterstrasse 123, 8000 Zürich",
  "items": [...],
  "subtotal": 705,
  "taxRate": 7.7,
  "taxAmount": 54.29,
  "total": 759.29,
  "notes": "Zahlung innerhalb 30 Tagen",
  "vehicle": {...},
  "createdBy": {...}
}
```

---

### Create Invoice
Create a new invoice or estimate.

**Endpoint:** `POST /invoices`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "type": "invoice",
  "customerName": "Max Mustermann",
  "customerEmail": "max@example.com",
  "customerAddress": "Musterstrasse 123, 8000 Zürich",
  "vehicleId": "uuid",
  "taxRate": 7.7,
  "items": [
    {
      "description": "Ölwechsel",
      "quantity": 1,
      "unitPrice": 80,
      "total": 80
    },
    {
      "description": "Ölfilter",
      "quantity": 1,
      "unitPrice": 25,
      "total": 25
    },
    {
      "description": "Arbeitsstunden (5h)",
      "quantity": 5,
      "unitPrice": 120,
      "total": 600
    }
  ],
  "notes": "Zahlung innerhalb 30 Tagen"
}
```

**Notes:**
- Invoice number is auto-generated (format: `INV-YYYY-NNNN`)
- Subtotal, tax amount, and total are calculated automatically
- Type can be `"estimate"` (Angebot) or `"invoice"` (Rechnung)

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2025-0001",
  "type": "invoice",
  "status": "draft",
  "customerName": "Max Mustermann",
  "customerEmail": "max@example.com",
  "customerAddress": "Musterstrasse 123, 8000 Zürich",
  "items": [...],
  "subtotal": 705,
  "taxRate": 7.7,
  "taxAmount": 54.29,
  "total": 759.29,
  "notes": "Zahlung innerhalb 30 Tagen",
  "vehicle": {...},
  "createdBy": {...},
  "createdAt": "2025-12-22T12:00:00Z",
  "updatedAt": "2025-12-22T12:00:00Z"
}
```

---

### Update Invoice
Update invoice information or status.

**Endpoint:** `PATCH /invoices/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Request Body (Update Status):**
```json
{
  "status": "sent"
}
```

**Request Body (Update Items):**
```json
{
  "items": [
    {
      "description": "Ölwechsel Premium",
      "quantity": 1,
      "unitPrice": 120,
      "total": 120
    }
  ],
  "taxRate": 7.7,
  "notes": "Updated invoice"
}
```

**Notes:**
- When updating items, totals are recalculated automatically
- Available statuses: `draft`, `sent`, `paid`, `cancelled`

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2025-0001",
  "type": "invoice",
  "status": "sent",
  "subtotal": 120,
  "taxRate": 7.7,
  "taxAmount": 9.24,
  "total": 129.24,
  ...
}
```

---

### Delete Invoice
Delete an invoice.

**Endpoint:** `DELETE /invoices/:id`

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-2025-0001"
}
```

---

## Audit Logs

### Get All Audit Logs
Retrieve audit logs with optional filters.

**Endpoint:** `GET /audit-logs`

**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
- `entityType` (optional): Filter by entity type (`vehicle`, `user`, etc.)
- `entityId` (optional): Filter by entity ID
- `userId` (optional): Filter by user who performed the action

**Example:** `GET /audit-logs?entityType=vehicle&entityId=uuid`

**Response:**
```json
[
  {
    "id": "uuid",
    "action": "CREATE",
    "entityType": "vehicle",
    "entityId": "uuid",
    "changes": {
      "vin": "WBA12345678901234",
      "brand": "BMW",
      "model": "X5",
      "year": 2023
    },
    "user": {
      "id": "uuid",
      "name": "Max Mustermann",
      "email": "max@example.com"
    },
    "createdAt": "2025-12-22T12:00:00Z"
  },
  {
    "id": "uuid",
    "action": "UPDATE",
    "entityType": "vehicle",
    "entityId": "uuid",
    "changes": {
      "old": {
        "isActive": true
      },
      "new": {
        "isActive": false
      }
    },
    "user": {
      "id": "uuid",
      "name": "Max Mustermann",
      "email": "max@example.com"
    },
    "createdAt": "2025-12-22T13:00:00Z"
  }
]
```

**Notes:**
- Actions: `CREATE`, `UPDATE`, `DELETE`
- Entity types: `vehicle`, `user`
- Changes field contains the data that was created/modified/deleted
- Ordered by most recent first

---

## Error Responses

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "message": "Registrierung fehlgeschlagen: Email already registered",
  "error": "Bad Request",
  "statusCode": 400
}
```

**401 Unauthorized:**
```json
{
  "message": "Ungültige Anmeldedaten",
  "error": "Unauthorized",
  "statusCode": 401
}
```

**404 Not Found:**
```json
{
  "message": "Vehicle with ID xyz not found",
  "error": "Not Found",
  "statusCode": 404
}
```

---

## Environment Variables

Required environment variables in `.env`:

```env
DATABASE_URL="postgresql://postgres:password@host:5432/database"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
AUTO_DEV_API_KEY="sk_ad_your-key"
```

---

## Database Schema Summary

### Users
- Authentication via Supabase
- Roles: `worker`, `admin`
- Tracks created/updated relationships

### Vehicles
- VIN (unique identifier)
- Basic info (brand, model, year, license plate)
- Work description (what needs to be done)
- Active/inactive status
- Tracks who created/updated

### Time Logs
- Links worker to vehicle
- Hours worked + optional notes
- Timestamped entries

### Invoices
- Auto-generated invoice numbers
- Types: estimate, invoice
- Statuses: draft, sent, paid, cancelled
- Line items with automatic calculations
- Swiss tax rate support (7.7%)

### Audit Logs
- Automatic tracking of all CREATE/UPDATE/DELETE operations
- Records who did what and when
- Stores full change history

---

## Technical Stack

- **Framework:** NestJS 11
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Prisma 5
- **Authentication:** Supabase Auth + JWT
- **Language:** TypeScript
- **API Style:** REST
- **Documentation:** German error messages for Swiss market

---

## Quick Start Examples

### Complete Workflow Example

```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"worker@garage.ch","password":"pass123","name":"Hans Meier"}'

# 2. Login
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"worker@garage.ch","password":"pass123"}' \
  | jq -r '.access_token')

# 3. Decode VIN
curl http://localhost:3000/vehicles/decode/WBA12345678901234 \
  -H "Authorization: Bearer $TOKEN"

# 4. Create Vehicle
VEHICLE_ID=$(curl -X POST http://localhost:3000/vehicles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"WBA12345678901234","brand":"BMW","model":"X5","year":2023,"licensePlate":"ZH-12345","workDescription":"Ölwechsel + Inspektion"}' \
  | jq -r '.id')

# 5. Log Time
curl -X POST http://localhost:3000/time-logs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vehicleId\":\"$VEHICLE_ID\",\"hours\":5.5,\"notes\":\"Ölwechsel durchgeführt\"}"

# 6. Create Invoice
curl -X POST http://localhost:3000/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"invoice\",\"customerName\":\"Max Mustermann\",\"customerEmail\":\"max@example.com\",\"vehicleId\":\"$VEHICLE_ID\",\"taxRate\":7.7,\"items\":[{\"description\":\"Ölwechsel\",\"quantity\":1,\"unitPrice\":150,\"total\":150}]}"

# 7. View Audit Logs
curl http://localhost:3000/audit-logs \
  -H "Authorization: Bearer $TOKEN"
```

---

## Support & Development

**Project:** Ocean Backend - Garage Management System
**Version:** 1.0.0
**Created:** December 2025
**Status:** Production Ready MVP

**Future Enhancements:**
- Photo upload (Supabase Storage)
- Parts management
- OCR for document extraction
- AI chat/calls integration
- Advanced reporting

---

*Documentation generated: December 22, 2025*
