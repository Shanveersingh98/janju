const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

// ── MongoDB connection (cached for serverless) ──
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
}

// ── Order Schema ──
const orderSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  phone:       { type: String, required: true },
  address:     { type: String, required: true },
  quantity:    String,
  payment:     String,
  message:     String,
  totalAmount: String,
  status:      { type: String, default: 'Confirmed' },
  createdAt:   { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ── Gmail Email ──
async function sendOrderEmail(order, orderId) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });

  const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0c88a;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#3D0C02,#2C1A0A);padding:28px;text-align:center;">
        <h1 style="color:#C9A84C;font-size:1.8rem;margin:0;">🦁 JANGJU – New Order!</h1>
        <p style="color:#E8C96E;margin:8px 0 0;">Saint-Warrior Formula</p>
      </div>
      <div style="padding:28px;background:#FDF6E3;">
        <div style="background:#f0fff4;border:1.5px solid #86efac;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          <strong style="color:#15803d;">Order ID:</strong>
          <span style="font-family:monospace;color:#15803d;margin-left:8px;">${orderId}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;width:120px;">👤 Name</td>
            <td style="padding:10px 8px;font-weight:600;">${order.name}</td>
          </tr>
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;">📞 Phone</td>
            <td style="padding:10px 8px;font-weight:600;">${order.phone}</td>
          </tr>
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;">📍 Address</td>
            <td style="padding:10px 8px;font-weight:600;">${order.address}</td>
          </tr>
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;">🛒 Quantity</td>
            <td style="padding:10px 8px;font-weight:600;">${order.quantity || '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;">💰 Amount</td>
            <td style="padding:10px 8px;font-weight:800;color:#3D0C02;font-size:1.1rem;">${order.totalAmount || '—'}</td>
          </tr>
          <tr style="border-bottom:1px solid #e0c88a;">
            <td style="padding:10px 8px;color:#888;font-weight:700;">💳 Payment</td>
            <td style="padding:10px 8px;font-weight:600;">${order.payment || '—'}</td>
          </tr>
          ${order.message ? `
          <tr>
            <td style="padding:10px 8px;color:#888;font-weight:700;">💬 Message</td>
            <td style="padding:10px 8px;font-style:italic;">${order.message}</td>
          </tr>` : ''}
        </table>
        <div style="margin-top:20px;padding:14px;background:#fffbf0;border:1px solid #fde68a;border-radius:8px;font-size:0.85rem;color:#92400e;">
          🕐 Order placed at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
        </div>
      </div>
      <div style="background:#3D0C02;padding:16px;text-align:center;">
        <p style="color:#C9A84C;margin:0;font-size:0.85rem;">Khalsa Dawakhana | Tarn-Taran Sahib, Punjab, India</p>
        <p style="color:#8B6914;margin:4px 0 0;font-size:0.75rem;">📞 +91 98557-82707 | +91 70093-99037</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"JANGJU Orders" <${process.env.GMAIL_USER}>`,
    to: adminEmail,
    subject: `🛒 New JANGJU Order from ${order.name} – ${order.totalAmount || 'N/A'}`,
    html
  });
}

// ── Main Vercel Handler ──
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  const { id } = req.query;

  // POST /api/orders — place order
  if (req.method === 'POST' && !id) {
    const { name, phone, address, quantity, payment, message, totalAmount } = req.body;
    if (!name || !phone || !address) {
      return res.json({ success: false, error: 'Name, phone and address are required' });
    }
    try {
      const order = new Order({ name, phone, address, quantity, payment, message, totalAmount });
      await order.save();

      sendOrderEmail({ name, phone, address, quantity, payment, message, totalAmount }, order._id.toString())
        .then(() => console.log('✅ Email sent'))
        .catch(err => console.error('⚠️ Email failed:', err.message));

      return res.json({ success: true, orderId: order._id.toString() });
    } catch (err) {
      console.error(err);
      return res.json({ success: false, error: 'Database error' });
    }
  }

  // DELETE /api/orders?id=xxx — cancel order
  if (req.method === 'DELETE' && id) {
    try {
      const order = await Order.findByIdAndDelete(id);
      if (!order) return res.json({ success: false, error: 'Order not found' });
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, error: 'Database error' });
    }
  }

  // GET /api/orders — list all orders
  if (req.method === 'GET' && !id) {
    try {
      const orders = await Order.find().sort({ createdAt: -1 });
      return res.json({ success: true, orders });
    } catch (err) {
      return res.json({ success: false, error: 'Database error' });
    }
  }

  return res.status(404).json({ error: 'Not found' });
}
