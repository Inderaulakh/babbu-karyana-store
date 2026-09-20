const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const seedProducts = require("./seed");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "store.sqlite"));

function hashPin(pin) {
  const secret = process.env.SESSION_SECRET || "babbu-karyana-secret";
  return crypto.scryptSync(String(pin), secret, 32).toString("hex");
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      price REAL NOT NULL,
      mrp REAL NOT NULL,
      emoji TEXT DEFAULT '🛒',
      tag TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      note TEXT DEFAULT '',
      items_json TEXT NOT NULL,
      items_text TEXT NOT NULL,
      subtotal REAL NOT NULL,
      delivery_fee REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      email_sent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
  if (!count) {
    const insert = db.prepare(`
      INSERT INTO products (id, name, category, unit, price, mrp, emoji, tag, image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `);
    const now = Date.now();
    for (const p of seedProducts) {
      insert.run(p.id, p.name, p.category, p.unit, p.price, p.mrp, p.emoji, p.tag || "", now);
    }
  }

  const defaults = {
    storeName: "Babbu Karyana Store",
    ownerEmail: process.env.OWNER_EMAIL || "",
    ownerPhone: process.env.OWNER_PHONE || "",
    adminPinHash: hashPin(process.env.ADMIN_PIN || "1234"),
    deliveryMins: "20-30",
    freeDeliveryAbove: "299",
    deliveryFee: "20",
  };
  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, String(value));
  }

  const ownerEmail = db.prepare("SELECT value FROM settings WHERE key = ?").get("ownerEmail");
  if (process.env.OWNER_EMAIL && (!ownerEmail || !ownerEmail.value)) {
    db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(process.env.OWNER_EMAIL, "ownerEmail");
  }
}

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return {
    storeName: settings.storeName || "Babbu Karyana Store",
    ownerEmail: settings.ownerEmail || "",
    ownerPhone: settings.ownerPhone || "",
    deliveryMins: settings.deliveryMins || "20-30",
    freeDeliveryAbove: Number(settings.freeDeliveryAbove || 299),
    deliveryFee: Number(settings.deliveryFee || 20),
  };
}

function getAdminSettings() {
  return { ...getSettings(), adminPinHash: db.prepare("SELECT value FROM settings WHERE key = ?").get("adminPinHash")?.value };
}

function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

function listProducts() {
  return db.prepare("SELECT * FROM products ORDER BY created_at DESC, name ASC").all();
}

function getProduct(id) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
}

function createProduct(p) {
  const id = "p" + Date.now();
  db.prepare(`
    INSERT INTO products (id, name, category, unit, price, mrp, emoji, tag, image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, p.name, p.category, p.unit, p.price, p.mrp, p.emoji || "🛒", p.tag || "", p.image_url || "", Date.now());
  return getProduct(id);
}

function updateProduct(id, p) {
  db.prepare(`
    UPDATE products SET name = ?, category = ?, unit = ?, price = ?, mrp = ?, emoji = ?, tag = ?, image_url = ?
    WHERE id = ?
  `).run(p.name, p.category, p.unit, p.price, p.mrp, p.emoji || "🛒", p.tag || "", p.image_url || "", id);
  return getProduct(id);
}

function deleteProduct(id) {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

function createOrder(order) {
  db.prepare(`
    INSERT INTO orders (id, customer_name, phone, address, note, items_json, items_text, subtotal, delivery_fee, total, status, email_sent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
  `).run(
    order.id,
    order.customer_name,
    order.phone,
    order.address,
    order.note || "",
    JSON.stringify(order.items),
    order.items_text,
    order.subtotal,
    order.delivery_fee,
    order.total,
    order.email_sent ? 1 : 0,
    Date.now()
  );
  return getOrder(order.id);
}

function getOrder(id) {
  return mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id));
}

function listOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all().map(mapOrder);
}

function updateOrderStatus(id, status) {
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return getOrder(id);
}

function markEmailSent(id) {
  db.prepare("UPDATE orders SET email_sent = 1 WHERE id = ?").run(id);
}

function mapOrder(row) {
  if (!row) return null;
  return {
    ...row,
    items: JSON.parse(row.items_json || "[]"),
    email_sent: Boolean(row.email_sent),
    time: new Date(row.created_at).toLocaleString("en-IN"),
  };
}

function stats() {
  const all = db.prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders").get();
  const pending = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('new','confirmed')").get().n;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue FROM orders WHERE created_at >= ?").get(start.getTime());
  return {
    totalOrders: all.orders,
    totalRevenue: all.revenue,
    pending,
    todayOrders: today.n,
    todayRevenue: today.revenue,
  };
}

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)").run(token, expiresAt);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  return { token, expiresAt };
}

function validSession(token) {
  if (!token) return false;
  const row = db.prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > ?").get(token, Date.now());
  return Boolean(row);
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

init();

module.exports = {
  hashPin,
  getSettings,
  getAdminSettings,
  setSetting,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  markEmailSent,
  stats,
  createSession,
  validSession,
  destroySession,
};
