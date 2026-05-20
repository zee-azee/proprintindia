const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {

  const { amount } = req.body;

  try {

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
    });

    res.status(200).json(order);

  } catch (err) {

    res.status(500).json({
      error: err.message,
    });

  }
}
