const nodemailer = require("nodemailer");

function money(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function smtpPass() {
  return String(process.env.SMTP_PASS || "").replace(/\s/g, "");
}

function canSend() {
  return Boolean(process.env.SMTP_USER && smtpPass());
}

function transporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass(),
    },
  });
}

function orderText(order) {
  return [
    `Naya order #${order.id}`,
    `Naam: ${order.customer_name}`,
    `Mobile: ${order.phone}`,
    `Address: ${order.address}`,
    `Items: ${order.items_text}`,
    `Total: ${money(order.total)}`,
    order.note ? `Note: ${order.note}` : "",
    "Customer ko call karke confirm karo aur saman ghar pahuncha do.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendOrderEmail(to, order) {
  if (!to) return { sent: false, reason: "Owner email set nahi hai" };
  if (!canSend()) return { sent: false, reason: "SMTP .env mein set nahi hai" };

  await transporter().sendMail({
    from: `"Babbu Karyana Store" <${process.env.SMTP_USER}>`,
    to,
    subject: `Naya order #${order.id} - Babbu Karyana Store`,
    text: orderText(order),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px">
        <h2>Naya order #${order.id}</h2>
        <p><b>Naam:</b> ${order.customer_name}<br/>
        <b>Mobile:</b> ${order.phone}<br/>
        <b>Address:</b> ${order.address}</p>
        <p><b>Items:</b> ${order.items_text}</p>
        <p><b>Total:</b> ${money(order.total)}</p>
        ${order.note ? `<p><b>Note:</b> ${order.note}</p>` : ""}
        <p>Customer ko call karke confirm karo aur saman ghar pahuncha do.</p>
      </div>
    `,
  });
  return { sent: true };
}

async function sendTestEmail(to) {
  if (!to) throw new Error("Email daalo pehle");
  if (!canSend()) throw new Error("SMTP_USER aur SMTP_PASS .env mein set karo");
  await transporter().sendMail({
    from: `"Babbu Karyana Store" <${process.env.SMTP_USER}>`,
    to,
    subject: "Babbu Karyana Store - test email",
    text: "Email theek kaam kar raha hai. Naye orders yahan aa jayenge.",
  });
}

module.exports = { sendOrderEmail, sendTestEmail, canSend, orderText };
