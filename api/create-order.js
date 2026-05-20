export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const Razorpay = (await import("razorpay")).default;

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const options = {
      amount: 50000, // ₹500 in paise
      currency: "INR",
      receipt: "receipt_order_1",
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
}
