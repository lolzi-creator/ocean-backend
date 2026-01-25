#!/bin/bash

# Derendinger API Test - Full Flow with 3 Random Parts
# Parts: Luftfilter (10050), Pollenfilter (65900), Bremsbeläge vo (48800)

echo "🚗 Derendinger Full Flow Test - 3 Parts"
echo "========================================"
echo "Parts: Luftfilter + Pollenfilter + Bremsbeläge vo"
echo ""

VIN="WDD2053431F759027"
ESTIMATE_ID="12341767969731190"

# ============================================
# STEP 1: Get Token
# ============================================
echo "🔐 STEP 1: Login..."

TOKEN=$(curl -s -X POST "https://d-store.ch/auth-server-ch-ax/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic ZXNob3Atd2ViOnNhZy1lc2hvcC1id3M=" \
  -d "username=DMS-DDOceancar&password=Oceancar008&grant_type=password&scope=read%20write&affiliate=derendinger-ch&login_mode=NORMAL&located_affiliate=derendinger-ch" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "✅ Token: ${TOKEN:0:40}..."
echo ""

# ============================================
# STEP 2: VIN Lookup
# ============================================
echo "🔍 STEP 2: VIN Lookup..."

VIN_RESPONSE=$(curl -s -X POST "https://d-store.ch/rest-ch-ax/gtmotive/vehicle/search-by-vin" \
  -H "Accept: application/json" \
  -H "Accept-Language: de" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Referer: https://d-store.ch/dch-ax/home" \
  -d "{\"vin\":\"$VIN\",\"estimateId\":\"$ESTIMATE_ID\"}")

UMC=$(echo "$VIN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('gtmotiveResponse',{}).get('umc',''))" 2>/dev/null)
EQUIPMENTS=$(echo "$VIN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('data',{}).get('gtmotiveResponse',{}).get('equipmentItems',[])))" 2>/dev/null)
EQUIP_RANKS=$(echo "$VIN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('data',{}).get('gtmotiveResponse',{}).get('equipmentRanks',[])))" 2>/dev/null)
VEHICLE_ID=$(echo "$VIN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('vehicle',{}).get('id','V119604M28178'))" 2>/dev/null)

echo "✅ UMC: $UMC"
echo "✅ Vehicle ID: $VEHICLE_ID"
echo ""

# ============================================
# STEP 3: Part List Search (get ALL available parts)
# ============================================
echo "📦 STEP 3: Part List Search (ALL available parts)..."

PART_LIST=$(curl -s -X POST "https://d-store.ch/rest-ch-ax/gtmotive/part-list/search" \
  -H "Accept: application/json" \
  -H "Accept-Language: de" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Referer: https://d-store.ch/dch-ax/home" \
  -d "{\"equipmentRanks\":$EQUIP_RANKS,\"equipments\":$EQUIPMENTS,\"umc\":\"$UMC\"}")

# Show selected parts we want to search
echo "$PART_LIST" | python3 -c "
import json, sys
data = json.load(sys.stdin)
target_codes = ['10050', '65900', '48800']
print('Selected parts to search:')
for fg in data.get('data', {}).get('functionalGroups', []):
    for p in fg.get('parts', []):
        if p.get('partCode') in target_codes:
            print(f'   ✅ {p.get(\"partCode\")}: {p.get(\"partDescription\")} ({fg.get(\"functionalGroupDescription\")})')
" 2>/dev/null
echo ""

# ============================================
# STEP 4: Multi-References Search
# ============================================
echo "📋 STEP 4: Multi-References Search..."

# Parts:
# - 10050 = Luftfilter (functionalGroup from part list)
# - 65900 = Pollenfilter
# - 48800 = Bremsbeläge vo

MULTI_REF_RESPONSE=$(curl -s -X POST "https://d-store.ch/rest-ch-ax/gtmotive/multi-references/search" \
  -H "Accept: application/json" \
  -H "Accept-Language: de" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Referer: https://d-store.ch/dch-ax/home" \
  -d "{
    \"gtmotiveMultiPartsThreeSearchRequest\": {
      \"umc\": \"$UMC\",
      \"equipments\": $EQUIPMENTS,
      \"equipmentRanks\": $EQUIP_RANKS,
      \"partSnapshots\": [
        {\"functionalGroup\": \"10H00\", \"partCode\": \"10050\"},
        {\"functionalGroup\": \"65H00\", \"partCode\": \"65900\"},
        {\"functionalGroup\": \"48H00\", \"partCode\": \"48800\"}
      ]
    },
    \"isVinMode\": true,
    \"isMaintenance\": false
  }")

echo "OE References found:"
echo "$MULTI_REF_RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for item in d.get('data',[]):
    pc = item.get('partCode')
    ops = item.get('operations',[])
    if ops:
        for op in ops:
            print(f'   ✅ {pc}: {op.get(\"description\")} -> {op.get(\"reference\")}')
    else:
        print(f'   ❌ {pc}: No OE reference found')
" 2>/dev/null
echo ""

# ============================================
# STEP 5: Build Operations Array
# ============================================
echo "🔧 STEP 5: Building operations..."

OPERATIONS=$(echo "$MULTI_REF_RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ops = []
for item in d.get('data',[]):
    pc = item.get('partCode')
    for op in item.get('operations',[]):
        if op.get('reference'):
            ops.append({
                'reference': op.get('reference'),
                'description': op.get('description'),
                'auxiliarInformation': None,
                'supplyType': 'Neu',
                'cupi': pc,
                'isMaintenance': False
            })
print(json.dumps(ops))
" 2>/dev/null)

OP_COUNT=$(echo "$OPERATIONS" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null)
echo "✅ Operations count: $OP_COUNT"
echo ""

# ============================================
# STEP 6: Articles Search
# ============================================
echo "🛒 STEP 6: Articles Search..."

# Search for all parts
ARTICLES_RESPONSE=$(curl -s -X POST "https://d-store.ch/rest-ch-ax/gtmotive/v4/articles" \
  -H "Accept: application/json" \
  -H "Accept-Language: de" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Referer: https://d-store.ch/dch-ax/home" \
  -d "{
    \"makeCode\": \"MB1\",
    \"operations\": $OPERATIONS,
    \"vin\": \"$VIN\",
    \"estimateId\": \"$ESTIMATE_ID\",
    \"cupis\": [],
    \"vehicleId\": \"$VEHICLE_ID\",
    \"partCodes\": [],
    \"selectedCategoryIds\": [],
    \"checkLiquidation\": true
  }")

echo ""
echo "📦 Articles found:"
echo "$ARTICLES_RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
v4 = d.get('data',{}).get('articlesV4',{})
total = 0
for cat in v4.get('content',[]):
    for ga in cat.get('genArts',[]):
        arts = ga.get('articles',[])
        total += len(arts)
        if arts:
            name = arts[0].get('genArtTxts',[{}])[0].get('gatxtdech', arts[0].get('name',''))
            print(f'')
            print(f'   📦 {name}: {len(arts)} articles')
            for a in arts[:3]:
                supplier = a.get('supplier')
                if isinstance(supplier, dict):
                    supplier = supplier.get('description','')
                stock = a.get('stock',{})
                if isinstance(stock, dict):
                    stock = stock.get('stock', 0)
                print(f'      • {supplier} {a.get(\"artnr_display\",\"\")} (Stock: {stock})')
print(f'')
print(f'========================================')
print(f'✅ TOTAL: {total} articles found!')
" 2>/dev/null

echo ""
echo "========================================"
echo "✅ Test complete!"
