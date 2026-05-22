/**
 * Setup Script: Hoa Lư Garden Resort
 * Creates 4 ProductCategories (Khu A/B/C/D) and 41 Products (rooms) + ancillary services.
 *
 * Run once on Staging, then Production.
 * Usage: npx ts-node -P tsconfig.app.json scripts/setup-hoa-lu-resort.ts
 *
 * Prerequisites:
 * - .env file with MONGODB_URI set
 * - ORG_ID environment variable set to Hoa Lư orgId
 * - OWNER_USER_ID environment variable set to the owner's userId
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const MONGODB_URI = process.env['MONGODB_URI'];
const ORG_ID = process.env['ORG_ID'] || '69fb393969da8e168328bd2a'; // Hoa Lư orgId
const OWNER_USER_ID = process.env['OWNER_USER_ID'] || '';
const DB_NAME = 'core_cbm';

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

// ─── Room definitions ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { code: 'KHU-A', name: 'Khu A' },
  { code: 'KHU-B', name: 'Khu B' },
  { code: 'KHU-C', name: 'Khu C' },
  { code: 'KHU-D', name: 'Khu D' },
];

// Room layout per khu based on typical 41-room resort distribution
const ROOMS_PER_KHU: Record<string, Array<{ code: string; capacity: number; bedConfig: string; priceWeekday: number; priceWeekend: number }>> = {
  A: [
    { code: 'A01', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A02', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A03', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A04', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A05', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A06', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A07', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A08', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A09', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A10', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
    { code: 'A11', capacity: 8, bedConfig: '3 giường 1.6×2m', priceWeekday: 1650000, priceWeekend: 1800000 },
  ],
  B: [
    { code: 'B01', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B02', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B03', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B04', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B05', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B06', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B07', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B08', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B09', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
    { code: 'B10', capacity: 10, bedConfig: '4 giường 1.6×2m', priceWeekday: 1900000, priceWeekend: 2100000 },
  ],
  C: [
    { code: 'C01', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C02', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C03', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C04', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C05', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C06', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C07', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C08', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C09', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
    { code: 'C10', capacity: 12, bedConfig: '4 giường 1.8×2m', priceWeekday: 2200000, priceWeekend: 2500000 },
  ],
  D: [
    { code: 'D01', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D02', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D03', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D04', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D05', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D06', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D07', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D08', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D09', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
    { code: 'D10', capacity: 6, bedConfig: '2 giường 1.6×2m', priceWeekday: 1300000, priceWeekend: 1500000 },
  ],
};

// Ancillary services (not khu-specific)
const ANCILLARY_SERVICES = [
  { code: 'PHU_THU', name: 'Phụ thu cuối tuần', price: 200000 },
  { code: 'EXTRA_BED', name: 'Giường phụ', price: 150000 },
  { code: 'KHONG_AN_SANG', name: 'Không ăn sáng (giảm trừ)', price: -100000 },
  { code: 'CI_SOM', name: 'Check-in sớm', price: 100000 },
  { code: 'CO_MUON', name: 'Check-out muộn', price: 100000 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(DB_NAME);

  const catCol = db.collection('product_categories');
  const prodCol = db.collection('products');

  const owner = {
    orgId: ORG_ID,
    userId: OWNER_USER_ID,
    groupId: '',
    agentId: '',
    appId: '',
  };

  const auditUser = {
    userId: OWNER_USER_ID,
    roles: ['organization.owner'],
    orgId: ORG_ID,
    groupId: '',
    agentId: '',
    appId: '',
  };

  const now = new Date();

  // Create/update categories
  const categoryIdMap: Record<string, string> = {};

  console.log('--- Creating product categories ---');
  for (const cat of CATEGORIES) {
    const existing = await catCol.findOne({ 'owner.orgId': ORG_ID, code: cat.code, isDeleted: { $ne: true } });
    if (existing) {
      console.log(`  [skip] Category ${cat.code} already exists`);
      categoryIdMap[cat.code] = String(existing._id);
    } else {
      const result = await catCol.insertOne({
        code: cat.code,
        name: cat.name,
        owner,
        createdBy: auditUser,
        updatedBy: auditUser,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      categoryIdMap[cat.code] = String(result.insertedId);
      console.log(`  [created] Category ${cat.code}: ${cat.name} (${result.insertedId})`);
    }
  }

  // Create/update room products
  console.log('\n--- Creating room products ---');
  let roomCount = 0;
  for (const [khu, rooms] of Object.entries(ROOMS_PER_KHU)) {
    const catCode = `KHU-${khu}`;
    const catId = categoryIdMap[catCode];

    for (const room of rooms) {
      const existing = await prodCol.findOne({ 'owner.orgId': ORG_ID, code: room.code, isDeleted: { $ne: true } });
      if (existing) {
        console.log(`  [skip] Room ${room.code} already exists`);
        continue;
      }

      await prodCol.insertOne({
        code: room.code,
        name: `Phòng ${room.code}`,
        categoryId: catId,
        price: { currency: 'VND', value: room.priceWeekend },
        taxRate: 0,
        status: 'active',
        imageIds: [],
        metadata: {
          bookingType: 'room',
          maxGuests: room.capacity,
          bedConfig: room.bedConfig,
          priceWeekday: room.priceWeekday,
          priceWeekend: room.priceWeekend,
        },
        searchText: `phong ${room.code.toLowerCase()} khu ${khu.toLowerCase()}`,
        owner,
        createdBy: auditUser,
        updatedBy: auditUser,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      roomCount++;
    }
    console.log(`  Khu ${khu}: ${rooms.length} rooms processed`);
  }

  // Create/update ancillary services (use first category or null)
  console.log('\n--- Creating ancillary services ---');
  for (const svc of ANCILLARY_SERVICES) {
    const existing = await prodCol.findOne({ 'owner.orgId': ORG_ID, code: svc.code, isDeleted: { $ne: true } });
    if (existing) {
      console.log(`  [skip] Service ${svc.code} already exists`);
      continue;
    }

    await prodCol.insertOne({
      code: svc.code,
      name: svc.name,
      categoryId: null,
      price: { currency: 'VND', value: Math.abs(svc.price) },
      taxRate: 0,
      status: 'active',
      metadata: { bookingType: 'service', isDiscount: svc.price < 0 },
      searchText: `${svc.code.toLowerCase()} ${svc.name.toLowerCase()}`,
      owner,
      createdBy: auditUser,
      updatedBy: auditUser,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  [created] Service ${svc.code}: ${svc.name}`);
  }

  console.log(`\n✅ Done! Created ${roomCount} rooms + ancillary services`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
