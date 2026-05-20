export default async function handler(req, res) {

  const auth = Buffer.from(
    process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET
  ).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`
    },
    body: JSON.stringify({
      amount: 49900,
      currency: "INR",
      receipt: "receipt#1"
    })
  });

  const data = await response.json();

  res.status(200).json(data);
}
