export default async function handler(req, res) {
  res.status(200).json({
    id: "order_test_123",
    amount: 50000,
    currency: "INR"
  });
}
