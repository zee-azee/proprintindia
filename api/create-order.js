import Razorpay from "razorpay";
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID.trim(),
  key_secret: process.env.RAZORPAY_KEY_SECRET.trim(),
});

// Single source of truth for plan amounts — never trust amount from frontend
const PLANS = {
  starter:      { amount: 199, credits: 20 },
  professional: { amount: 499, credits: 60 },
  studio:       { amount: 999, credits: 150 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { plan } = req.body;
    const selected = PLANS[plan];

    if (!selected) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const order = await razorpay.orders.create({
      amount: selected.amount * 100, // paise
      currency: "INR",
      notes: { plan },
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
}
