// Deterministic demo data for ReturnDesk: 38 return requests (36 visible + 2 removed) with agent notes.
// Pure module: it only builds plain objects; scripts/seed.js turns them into SQL. Ages are hours before "now".
import { REASONS } from '../lib/constants.js';

const STATUS_COUNTS = [
  ['Open', 8],
  ['In Review', 7],
  ['Approved', 7],
  ['Rejected', 7],
  ['Completed', 7],
];

// Fake but realistic customers; contact details use example.com and obviously fake phone numbers.
const CUSTOMERS = [
  'Aarav Mehta', 'Diya Sharma', 'Vivaan Nair', 'Ananya Iyer', 'Rohan Gupta', 'Ishita Rao',
  'Kabir Malhotra', 'Meera Pillai', 'Arjun Reddy', 'Saanvi Kapoor', 'Aditya Joshi', 'Tara Bose',
  'Neel Banerjee', 'Kavya Menon', 'Dev Choudhary', 'Riya Desai', 'Yash Kulkarni', 'Pooja Shetty',
  'Samar Khanna', 'Nisha Patel', 'Harsh Vora', 'Ira Sethi', 'Manav Arora', 'Sneha Naidu',
  'Tejas Bhat', 'Zoya Qureshi', 'Karan Sinha', 'Lakshmi Venkat', 'Omkar Jadhav', 'Prerna Singh',
  'Rahul Verma', 'Simran Kaur', 'Varun Agarwal', 'Aisha Khan', 'Nikhil Das', 'Bhavna Thakur',
  'Chirag Mistry', 'Devika Rane',
];

// Generic store catalogue (no brand names).
const PRODUCTS = [
  { sku: 'TSH-CREW-M-BLK', name: 'Cotton Crew T-Shirt (M, Black)' },
  { sku: 'SHO-RUN-UK9', name: 'Running Shoes (UK 9)' },
  { sku: 'MUG-CER-SET4', name: 'Ceramic Mug Set of 4' },
  { sku: 'BTL-STEEL-1L', name: 'Steel Water Bottle 1L' },
  { sku: 'BAG-BKP-30L', name: 'Backpack 30L' },
  { sku: 'MAT-YOGA-6MM', name: 'Yoga Mat 6mm' },
  { sku: 'PIL-FOAM-STD', name: 'Memory Foam Pillow (Standard)' },
  { sku: 'EAR-WL-BLK', name: 'Wireless Earbuds (Black)' },
  { sku: 'JKT-DNM-L', name: 'Denim Jacket (L)' },
  { sku: 'BED-SHEET-QN', name: 'Cotton Bed Sheet Set (Queen)' },
];

const AGENTS = ['Priya (Support)', 'Rahul (Support)', 'Meera (Warehouse)', 'Karan (Finance)'];

// Resolutions for the 7 Approved and the 7 Completed rows: 6 Refund, 4 Replacement, 4 Store Credit in total.
const APPROVED_RESOLUTIONS = ['Refund', 'Replacement', 'Store Credit', 'Refund', 'Replacement', 'Store Credit', 'Refund'];
const COMPLETED_RESOLUTIONS = ['Refund', 'Store Credit', 'Replacement', 'Refund', 'Replacement', 'Store Credit', 'Refund'];
const REFUND_AMOUNTS = ['499.00', '1299.00', '349.50', '2199.00', '899.00', '159.00'];

// Note bodies per status, used in order for a request's first, second and third note.
const NOTE_BODIES = {
  Open: [
    'Customer called to ask about the return window; confirmed the item is eligible.',
    'Asked the customer to share photos of the item and the original packaging.',
    'Photos received. Moving this to review once the warehouse confirms the pickup slot.',
  ],
  'In Review': [
    'Photos checked against the order. Waiting for the warehouse to inspect the item.',
    'Warehouse confirmed the item arrived back at the store. Inspection in progress.',
    'Inspection notes attached to the order. Decision pending a supervisor check.',
  ],
  Approved: [
    'Return approved after inspection. Customer informed by email.',
    'Resolution agreed with the customer. Payment or dispatch is being arranged.',
    'Finance has been asked to process the approved resolution.',
  ],
  Rejected: [
    'Item shows signs of use that are outside the return policy.',
    'Explained the policy to the customer. They accepted the decision.',
    'Customer asked for a second look; the original decision stands.',
  ],
  Completed: [
    'Resolution processed and the customer has been notified.',
    'Customer confirmed they received the refund, replacement or credit.',
    'Closing the loop with the customer. No further action needed.',
  ],
};

// Number of notes for each of the 36 visible requests (in build order); 20 of them have notes, 11 with 2-3 notes.
const NOTE_COUNTS = [
  2, 0, 1, 3, 0, 2, 1, 0, // Open (8)
  0, 2, 1, 0, 3, 0, 1, // In Review (7)
  2, 0, 1, 0, 2, 0, 3, // Approved (7)
  1, 0, 2, 0, 0, 1, 0, // Rejected (7)
  3, 0, 1, 0, 0, 2, 0, // Completed (7)
];

// Builds the note list for one request: timestamps strictly increase, every one after the request's created_at.
function buildNotes(status, count, createdHoursAgo, seed) {
  const notes = [];
  for (let j = 0; j < count; j += 1) {
    notes.push({
      author: AGENTS[(seed + j) % AGENTS.length],
      body: NOTE_BODIES[status][j],
      hoursAgo: createdHoursAgo - 3 * (j + 1),
    });
  }
  return notes;
}

// Builds the 36 visible requests: each status cycles through all five reasons so every status x reason pair appears.
function buildVisibleRows() {
  const rows = [];
  let n = 0;
  for (const [status, total] of STATUS_COUNTS) {
    for (let i = 0; i < total; i += 1) {
      const customerName = CUSTOMERS[n];
      const slug = customerName.toLowerCase().replace(' ', '.');
      const product = PRODUCTS[(n * 3) % PRODUCTS.length];
      // Contact variety: most have both, some only an email, some only a phone.
      const hasEmail = n % 5 !== 3;
      const hasPhone = n % 3 === 0 || n % 5 === 3;

      let resolution = null;
      let refundAmount = null;
      if (status === 'Approved' || status === 'Completed') {
        resolution = (status === 'Approved' ? APPROVED_RESOLUTIONS : COMPLETED_RESOLUTIONS)[i];
        if (resolution === 'Refund') refundAmount = REFUND_AMOUNTS[rows.filter((r) => r.refundAmount).length];
      }

      // Spread over roughly the last 45 days: 17 is coprime with 38, so the ages are all distinct.
      const createdHoursAgo = 60 + ((n * 17) % 38) * 27;
      const noteCount = NOTE_COUNTS[n];
      // Work after the last note (or a couple of hours after creation) is what last touched the request.
      const lag = noteCount * 3 + (status === 'Open' ? 0 : 2);

      rows.push({
        customerName,
        customerEmail: hasEmail ? `${slug}@example.com` : null,
        customerPhone: hasPhone ? `+91 90000 ${String(10 + n).padStart(5, '0')}` : null,
        orderNumber: `ORD-${10001 + n}`,
        itemSku: product.sku,
        itemName: product.name,
        quantity: product.sku === 'MUG-CER-SET4' || n % 7 === 4 ? 2 : 1,
        reason: REASONS[(i + n) % REASONS.length],
        status,
        resolution,
        refundAmount,
        createdHoursAgo,
        updatedHoursAgo: createdHoursAgo - lag,
        removedHoursAgo: null,
        notes: buildNotes(status, noteCount, createdHoursAgo, n),
      });
      n += 1;
    }
  }
  return rows;
}

// Makes a newer Open request for the same customer, order and item as an earlier closed one (rule 3 demonstration).
function addReorder(rows, earlier, newerHoursAgo, reason) {
  const created = newerHoursAgo;
  const noteBodies = NOTE_BODIES.Open;
  rows.push({
    ...earlier,
    reason,
    status: 'Open',
    resolution: null,
    refundAmount: null,
    createdHoursAgo: created,
    updatedHoursAgo: created - 3,
    removedHoursAgo: null,
    notes: [{ author: AGENTS[0], body: noteBodies[0], hoursAgo: created - 3 }],
  });
}

// Returns the complete, deterministic list of 38 requests (36 visible + 2 removed), each with its notes.
export function buildSeedData() {
  const rows = buildVisibleRows();

  // Rule-3 demos: the first Rejected and the first Completed request each get a newer Open request for the same
  // order + item. To keep the visible Open count at 8, the newest two Open requests are converted into those re-orders.
  const openRows = rows.filter((row) => row.status === 'Open');
  const firstRejected = rows.find((row) => row.status === 'Rejected');
  const firstCompleted = rows.find((row) => row.status === 'Completed');
  firstRejected.createdHoursAgo = 900;
  firstRejected.updatedHoursAgo = 900 - firstRejected.notes.length * 3 - 2;
  firstRejected.notes = buildNotes('Rejected', firstRejected.notes.length, 900, 1);
  firstCompleted.createdHoursAgo = 840;
  firstCompleted.updatedHoursAgo = 840 - firstCompleted.notes.length * 3 - 2;
  firstCompleted.notes = buildNotes('Completed', firstCompleted.notes.length, 840, 2);

  const converted = [openRows[openRows.length - 1], openRows[openRows.length - 2]];
  rows.splice(rows.indexOf(converted[0]), 1);
  rows.splice(rows.indexOf(converted[1]), 1);
  addReorder(rows, firstRejected, 300, converted[0].reason);
  addReorder(rows, firstCompleted, 240, converted[1].reason);

  // Removed requests (taken off the desk): one Open with notes, one Rejected. Rows and notes stay in the database.
  const base = rows.length;
  const removedOpen = {
    customerName: 'Gauri Phadke',
    customerEmail: 'gauri.phadke@example.com',
    customerPhone: null,
    orderNumber: `ORD-${10001 + base}`,
    itemSku: 'EAR-WL-BLK',
    itemName: 'Wireless Earbuds (Black)',
    quantity: 1,
    reason: 'Changed Mind',
    status: 'Open',
    resolution: null,
    refundAmount: null,
    createdHoursAgo: 700,
    updatedHoursAgo: 700 - 6,
    removedHoursAgo: 700 - 7,
    notes: [
      { author: AGENTS[0], body: 'Customer says they logged this by mistake and asked us to remove it.', hoursAgo: 697 },
      { author: AGENTS[1], body: 'Confirmed with the customer. Request taken off the desk.', hoursAgo: 694 },
    ],
  };
  const removedRejected = {
    customerName: 'Hemant Rastogi',
    customerEmail: null,
    customerPhone: '+91 90000 00099',
    orderNumber: `ORD-${10002 + base}`,
    itemSku: 'JKT-DNM-L',
    itemName: 'Denim Jacket (L)',
    quantity: 1,
    reason: 'Size Issue',
    status: 'Rejected',
    resolution: null,
    refundAmount: null,
    createdHoursAgo: 620,
    updatedHoursAgo: 620 - 2,
    removedHoursAgo: 620 - 5,
    notes: [],
  };
  rows.push(removedOpen, removedRejected);
  return rows;
}
