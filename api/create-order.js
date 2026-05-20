const Razorpay = require("razorpay");

module.exports = async (req, res) => {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: 49900,
      currency: "INR",
      receipt: "receipt_order_1",
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};
