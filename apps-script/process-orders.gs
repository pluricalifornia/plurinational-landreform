const FILE_IDS = {
  orderSheet: '16Bcwj7O4A-l8F4SyCWdjE-ftz8Q3GUNSewB45GazFSw',
  dataSheet: '1bsXFBK4f4K-201cBkNPdlBLbGUjWBvATwX18UEGCi5U'
};

const BUYERS_CLUBS = [
  'Columbae',
  'Synergy',
  'Kairos',
  'EBF',
  'Terra',
  'Muwekma',
  'Ithaka',
  '576',
  'Homies Empowerment',
  "HERO Tent",
  "SEIU Local 2007",
  "Hammarskjold",
  "NOak Assembly",
  "East Lake",
  "West Oakland",
  "Frutivale",
  "North Oakland",
  "Haight St",
  "Mycelium Youth Network",
  "El Cerrito",
  "Berkeley student coop",
  "Mission"
];

// Farmers and formations come from products.json:
//   formations: { coalicion: { short: 'Coalición', turnaroundDays: 2, ... }, ... }
//   farmers: { Mayra: 'coalicion', ... }, and each product lists its farmers

// Data sheet column positions (from 0) read when totalling farmer earnings
// Data sheet columns: Timestamp, Buyers Club, Formation, Farmer, Product, Quantity, Unit, Cost
const DATA_SHEET_COLUMNS = { farmer: 3, cost: 7 };

// Days of sales counted when choosing the lowest-earning farmer
const WINDOW_DAYS = 30;

// Where "needs attention" emails go
const ALERT_EMAIL = 'pluricalifornia@gmail.com';

// URL of products.json on the live site
const PRODUCTS_URL = 'https://raw.githubusercontent.com/pluricalifornia/plurinational-landreform/order-automation/products.json'

// Returns { formations: {...}, farmers: {...}, products: [...] }
function loadProductData() {
  // Fetch data from GitHub. ?t= skips stale caches
  var res = UrlFetchApp.fetch(PRODUCTS_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('Could not load products.json: HTTP ' + res.getResponseCode());
  }
  var data = JSON.parse(res.getContentText());
  data.products = Object.values(data.products).flat();  // Products are grouped by heading; use one list
  return data;
}

// Look up product by exact name
function findProduct(data, name) {
  return data.products.filter(function(p) {
    return p.name === name;
  })[0] || null;
}

// Get total amount purchased per farmer in window of given length (days)
// history: data sheet rows (no header), newest first
// Ideally we'll store these somewhere in the future, but this is easier to handle for now
function getRollingFarmerTotals(timestamp, data, history, window=WINDOW_DAYS) {
  var rollingTotals = {};
  for (var farmer in data.farmers) {
    rollingTotals[farmer] = 0;
  }
  const rows = history;

  for (let i = 0; i < rows.length; i++) {  // Newest rows are at the top
    if (new Date(rows[i][0]) >= timestamp - window * 24 * 60 * 60 * 1000) {  // if timestamp in range (days → ms)
      if (rows[i][DATA_SHEET_COLUMNS.farmer] in rollingTotals) {  // Skips Unknown and Unassigned farmers
        rollingTotals[rows[i][DATA_SHEET_COLUMNS.farmer]] += Number(rows[i][DATA_SHEET_COLUMNS.cost]) || 0;  // Add the cost to rolling total
      }
    } else {
      break;
    }
  }

  return rollingTotals;
}

// Whole days from the order to its preferred delivery date
function daysToDelivery(timestamp, preferred) {
  if (!preferred) return null;
  // Get the date into the right format
  var d = new Date(preferred instanceof Date ? preferred : String(preferred).replace(/-/g, '/'));
  if (isNaN(d)) return null;
  var t = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 864e5);
}

// Run from the editor to check daysToDelivery
function testDaysToDelivery() {
  var sun = new Date(2026, 10, 15, 22, 30);
  if (daysToDelivery(sun, '2026-11-17') !== 2) throw new Error('string date');
  if (daysToDelivery(sun, new Date(2026, 10, 19)) !== 4) throw new Error('Date value');
  if (daysToDelivery(sun, '') !== null) throw new Error('no date');
  Logger.log('ok');
}

// Get farmer with lowest rolling sum
function getLowestEarningFarmer(rollingTotals, farmerOptions) {
  var minFarmers = [];
  var minTotal = Infinity;
  for (var i = 0; i < farmerOptions.length; i++) {
    var total = rollingTotals[farmerOptions[i]];
    if (total < minTotal) {
      minFarmers = [farmerOptions[i]];
      minTotal = total;
    } else if (total === minTotal) {
      minFarmers.push(farmerOptions[i]);
    }
  }
  // Break ties at random
  return minFarmers[Math.floor(Math.random() * minFarmers.length)];
}

// Returns [quantity in individual units, cost]. Cost is '' when the item can't be priced
// Old orders: pricing is 'individual' or 'bulk'
// New orders: pricing is blank, and the quantity fills as many bulk boxes as fit
function itemCost(p, qty, pricing, size) {
  var prices = p.hasSizes ? p.sizes.filter(function(s) { return s.size === size; })[0] : p;
  // Bulk box size in individual units
  var numBulkUnits = p.noBulk || pricing === 'individual' ? 0
          : Math.round(p.bulkUnit ? p.bulkQty / p.conversionRate : p.bulkQty);
  if (pricing === 'bulk' && numBulkUnits) qty *= numBulkUnits;  // Convert boxes to individual units
  if (p.tbd || !prices) return [qty, ''];
  var bulkAmt = numBulkUnits ? Math.floor(qty / numBulkUnits) : 0;
  var cost = (bulkAmt ? bulkAmt * prices.bulk : 0) + (qty - bulkAmt * numBulkUnits) * prices.individual;
  return [qty, Math.round(cost * 100) / 100];
}

// Make one data sheet row per item in the order: [Timestamp, Buyers Club, Formation, Farmer, Product, Quantity, Unit, Cost]
// Add them to the top of history (newest first). populateDataSheet writes them to the sheet
// Returns a list of items that need attention
function addOrderRows(row, col, data, history) {
  var timestamp = new Date(row[col._date]);
  var buyersClub = row[col.orgName];
  var problems = [];

  // The old form included pricing types for every item
  var isNew = row[col.pricing] === '';
  // Don't include old orders in rolling totals
  var rollingTotals = isNew ? getRollingFarmerTotals(timestamp, data, history) : null;
  // Farmers whose formation can't turn the order around by this date are skipped
  var daysAhead = daysToDelivery(timestamp, row[col.preferredDate]);

  // Compile fields into JSON for a new row
  function makeItem(name, quantity, pricing, size) {
    return {
      name: name,
      product: findProduct(data, name),
      quantity: Number(quantity),
      rawQuantity: quantity === undefined ? '' : String(quantity),  // Keep submission value when conversion rates not available
      pricing: pricing || '',
      size: size || ''
    };
  }

  var items = [];
  if (row[col.items]) {
    // Newer submissions send every item in one JSON field
    JSON.parse(row[col.items]).forEach(function(it) {
      items.push(makeItem(it.product, it.quantity, '', it.size));
    });
  } else {
    // Older submissions: Formspree joins each repeated field with ', '
    var productList = String(row[col.product]).split(', ');
    var quantityList = String(row[col.quantity]).split(', ');
    var pricingList = String(row[col.pricing]).split(', ');
    var sizeList = String(row[col.size]).split(', ');  // Only sized products (salsas) submit a size

    for (var i = 0; i < productList.length; i++) {
      if (!productList[i]) {  // Blank "Select product" row
        continue;
      }
      // The old form ignored items with no pricing chosen
      if (!isNew && !pricingList[i]) {
        continue;
      }
      var product = findProduct(data, productList[i]);
      items.push(makeItem(productList[i], quantityList[i], isNew ? '' : pricingList[i],
                          product && product.hasSizes ? sizeList.shift() : ''));
    }
  }

  // Add each product to data sheet in order of fewest available farmers to most
  items.sort(function(a, b) {
    return (a.product ? a.product.farmers.length : 0) - (b.product ? b.product.farmers.length : 0);
  });

  var newRows = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    // Sized products (salsas) have no unit, so their size is the unit
    var unit = item.size || (item.product && item.product.unit) || '';
    var farmer = isNew ? 'Unassigned' : 'Unknown';  // Old orders are always 'Unknown'
    var formation = farmer;
    // Without the product's box size, keep the quantity as submitted, e.g. "2 bulk"
    var quantity = item.rawQuantity + (item.pricing ? ' ' + item.pricing : '');
    var cost = '';
    var problem = timestamp.toLocaleString() + ' · ' + buyersClub + ' · ' + item.name + ' (' + unit + '): ';

    if (!item.product) {  // Products that are no longer listed. Expected for old orders, only flag new ones
      if (isNew) problems.push(problem + 'not in products.json');
    } else if (!(item.quantity > 0)) {
      problems.push(problem + 'quantity missing or unreadable');
    } else {
      // Calculate cost
      var quantityAndCost = itemCost(item.product, item.quantity, item.pricing, item.size);
      quantity = quantityAndCost[0];
      cost = quantityAndCost[1];
      if (cost === '') {
        problems.push(problem + (item.product.tbd ? 'price is TBD' : 'no size chosen'));
      }

      // Choose farmer (if using new submission method)
      if (isNew) {
        // Skip names missing from the farmers list (typos); they have no formation
        var farmerOptions = item.product.farmers.filter(function(f) {
          if (!(f in data.farmers)) problems.push(problem + 'farmer "' + f + '" is not in the farmers list');
          return f in data.farmers;
        });
        var readyOptions = farmerOptions.filter(function(f) {
          return daysAhead === null || data.formations[data.farmers[f]].turnaroundDays <= daysAhead;
        });
        if (readyOptions.length) {
          farmer = getLowestEarningFarmer(rollingTotals, readyOptions);
          formation = data.formations[data.farmers[farmer]].short;
          rollingTotals[farmer] += cost || 0;
        } else if (farmerOptions.length) {
          // The form blocks this -- only happens if the date was edited after submission
          problems.push(problem + 'no farmer can have it ready in ' + daysAhead + ' days');
        } else {
          // Stays 'Unassigned': fill in the Farmer and Formation cells by hand; rolling totals pick it up from then on
          problems.push(problem + 'no farmer listed in products.json');
        }
      }
    }

    newRows.push([timestamp, buyersClub, formation, farmer, item.name, quantity, unit, cost]);
  }

  history.unshift.apply(history, newRows);  // Later orders count these in their rolling totals
  return problems;
}


// Add every order newer than the top row of the data sheet.
// To backfill, clear the data sheet down to its header row and run this.
function populateDataSheet() {
  const orderSheet = SpreadsheetApp.openById(FILE_IDS.orderSheet).getActiveSheet();
  const dataSheet = SpreadsheetApp.openById(FILE_IDS.dataSheet).getActiveSheet();
  var data = loadProductData();

  var orders = orderSheet.getDataRange().getValues();
  // Column index by header name, e.g. orders[i][col.product]
  var col = {};
  orders[0].forEach(function(name, i) {
    col[name] = i;
  });

  // Read the data sheet once; new rows are added to the top of history as orders are processed
  // Skips blank rows (e.g. left by a run that stopped partway)
  var history = dataSheet.getDataRange().getValues().slice(1).filter(function(r) {
    return r[0] !== '';
  });
  var existingCount = history.length;

  // Compare whole seconds (Sheets may drop milliseconds)
  var lastSecond = history.length ? Math.floor(new Date(history[0][0]) / 1000) : -Infinity;
  Logger.log('Newest order already in data sheet: ' + (history.length ? history[0][0] : 'none'));

  var problems = [];
  for (let i = 1; i < orders.length; i++) {
    if (!orders[i][col._date]) continue;
    var timestamp = new Date(orders[i][col._date]);
    if (isNaN(timestamp)) {
      throw new Error('Could not read the date in order sheet row ' + (i + 1) + ': ' + orders[i][col._date]);
    }
    if (Math.floor(timestamp / 1000) <= lastSecond) continue;  // Already processed
    problems = problems.concat(addOrderRows(orders[i], col, data, history));
  }

  // Write all new rows at once
  var newRows = history.slice(0, history.length - existingCount);
  Logger.log('Newest order in order sheet: ' + orders[orders.length - 1][col._date] + ' · added ' + newRows.length + ' rows');
  if (newRows.length) {
    dataSheet.insertRowsAfter(1, newRows.length);  // Insert after header
    dataSheet.getRange(2, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  // One email per run listing everything that needs attention
  if (problems.length) {
    MailApp.sendEmail(ALERT_EMAIL, 'Territorial Markets: ' + problems.length + ' order item(s) need attention',
      'These items were added to the data sheet without a farmer or cost:\n\n' + problems.join('\n'));
  }
}

// Run from the editor to check the pricing math
function testItemCost() {
  var broccoli = { individual: 3, bulk: 25, bulkQty: 12 };
  var cabbage = { individual: 3, bulk: 35, bulkQty: 35, bulkUnit: 'lb', conversionRate: 2.9166666666666665 };
  var avocado = { individual: 2.5, noBulk: true };
  var salsa = { bulkQty: 3, hasSizes: true, sizes: [{ size: '16 oz', individual: 8, bulk: 24 }] };
  var cases = [
    [itemCost(broccoli, 30, ''), [30, 68]],             // New: 2 boxes + 6 lb
    [itemCost(broccoli, 2, 'bulk'), [24, 50]],          // Old: 2 boxes
    [itemCost(broccoli, 30, 'individual'), [30, 90]],   // Old: all individual
    [itemCost(cabbage, 13, ''), [13, 38]],              // 1 box (≈12 pz) + 1 pz
    [itemCost(avocado, 4, ''), [4, 10]],                // No bulk
    [itemCost(salsa, 4, '', '16 oz'), [4, 32]],         // 1 3-pack + 1
    [itemCost(salsa, 2, 'bulk', '16 oz'), [6, 48]],     // Old: 2 3-packs
    [itemCost(salsa, 4, ''), [4, '']],                  // No size chosen
    [itemCost({ tbd: true, individual: 0, bulk: 0, bulkQty: 48 }, 5, ''), [5, '']]
  ];
  cases.forEach(function(c, i) {
    if (JSON.stringify(c[0]) !== JSON.stringify(c[1])) {
      throw new Error('Case ' + i + ': got ' + JSON.stringify(c[0]) + ', expected ' + JSON.stringify(c[1]));
    }
  });
  Logger.log('All ' + cases.length + ' cases passed');
}
