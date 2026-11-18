// Shared by aggregate-order-form.html and member-order-form.html: builds their product rows from products.json
// Row: [name, unit, farm individual $, bulk case $, bulk case qty, bulk label, ORGANIC retail $, CONVENTIONAL retail $, meta]
// meta: f = formation names · tbd = price not set yet (excluded from totals) · prov = provisional price · note · tbdBulk = bulk label while TBD

const PLURAL = { basket: 'baskets', bunch: 'bunches', head: 'heads', dozen: 'dozen', jar: 'jars' };
const qtyLabel = (n, unit) => n + ' ' + (n === 1 ? unit : (PLURAL[unit] || unit));
const money = n => '$' + Number(n.toFixed(2));

// Returns { "Vegetables": [row, ...], ... }. Products with no farmers listed are left out
export async function loadCatalog() {
  // Fetch the product list
  const res = await fetch('products.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('products.json: HTTP ' + res.status);
  const data = await res.json();
  const catalog = {};
  // Compile info for each product
  for (const [heading, products] of Object.entries(data.products)) {
    const rows = [];
    for (const p of products) {
      if (!p.farmers.length) continue;
      const keys = [...new Set(p.farmers.map(f => data.farmers[f]))].filter(Boolean);
      const meta = { f: keys.map(k => data.formations[k].short), tbd: p.tbd, prov: p.provisional, note: p.note };
      // Bulk case size in individual units (cabbage's bulk case is weighed in lb but sold by the piece)
      const lot = p.noBulk || !p.bulkQty ? 0 : Math.round(p.bulkUnit ? p.bulkQty / p.conversionRate : p.bulkQty);
      // Sized products (salsas) get one row per size
      for (const s of p.hasSizes ? p.sizes : [p]) {
        const name = p.hasSizes ? `${p.name} (${s.size})` : p.name;
        const unit = p.hasSizes ? 'jar' : p.unit;
        const caseQty = p.bulkUnit ? `${qtyLabel(p.bulkQty, p.bulkUnit)} (≈${qtyLabel(lot, unit)})`
                      : p.hasSizes ? `${lot}-pack` : qtyLabel(lot, unit);
        const hasBulk = lot && !p.tbd;
        rows.push([name, unit, p.tbd ? 0 : s.individual, hasBulk ? s.bulk : null, hasBulk ? lot : null,
                   hasBulk ? `${money(s.bulk)} · ${caseQty}` : '',
                   s.retailOrganic ?? null, s.retailConventional ?? null,
                   { ...meta, tbdBulk: p.tbd && lot ? 'TBD · ' + caseQty : '' }]);
      }
    }
    if (rows.length) catalog[heading] = rows;
  }
  return catalog;
}

// Example boxes: product name → quantity per box
export const EXAMPLES = {
  maxima: {"Heirloom Tomatoes":2,"Roma Tomatoes":2,"Cherry Tomatoes":1,"Jalapeños":1,"Tomatillos (Standard)":1,"Grey Mexican Squash":2,"Sweet Corn":4,"Cucumber":1,"Cilantro":2,"Raspberries":1,"Yellow Onions":1},
  semana: {"Red Potatoes":3,"Yellow Onions":2,"Carrots":1,"Radishes":1,"Kale (Lacinato/Dino)":1,"Romaine Lettuce":1,"Broccoli":1,"Sweet Corn":3,"Cilantro":1,"Green Zucchini":2,"Roma Tomatoes":2,"Celery":1},
  solidaria: {"Eggs":1,"Handmade Blue Corn Tortilla Packs":1,"Sweet Corn":4,"Grey Mexican Squash":2,"Roma Tomatoes":2,"Jalapeños":1,"Cilantro":1},
  imbatible: {"Fennel":1,"Leeks":2,"Heirloom Tomatoes":2,"Roma Tomatoes":2,"Grey Mexican Squash":2,"Chard":1,"Raspberries":1,"Blackberries":1,"Sweet Corn":3,"Yellow Potatoes":2}
};

// Per-box cost of each example at pooled bulk, organic retail and conventional retail prices
// info: name → { ind, bulk, bulkQty, org, conv }. Items not in the catalog are skipped
export function exampleTotals(info) {
  const totals = {};
  for (const [k, ex] of Object.entries(EXAMPLES)) {
    let bulk = 0, org = 0, conv = 0;
    for (const [n, q] of Object.entries(ex)) {
      const p = info[n]; if (!p) { console.warn('Example item not in catalog:', n); continue; }
      bulk += q * (p.bulk ? Math.min(p.ind, p.bulk / p.bulkQty) : p.ind);
      org += q * (p.org != null ? p.org : p.ind);
      conv += q * (p.conv != null ? p.conv : p.ind);
    }
    totals[k] = { bulk, org, conv };
  }
  return totals;
}
