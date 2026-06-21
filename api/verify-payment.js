import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://mhqlqnsymvfkqedqmhqy.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLANS = {
  starter:      { amount: 199, credits: 20 },
  professional: { amount: 499, credits: 60 },
  studio:       { amount: 999, credits: 150 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan,
      userId,
    } = req.body;

    const selected = PLANS[plan];
    if (!selected) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

   const expectedSignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET.trim())
  .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await supabase.from("transactions").insert({
        user_id: userId,
        razorpay_order_id,
        razorpay_payment_id,
        amount_inr: selected.amount * 100,
        credits: selected.credits,
        status: "failed",
      });
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (fetchErr) {
      return res.status(500).json({ success: false, error: "Profile fetch failed" });
    }

    const currentCredits = profile?.credits || 0;
    const newCredits = currentCredits + selected.credits;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ credits: newCredits })
      .eq("id", userId);

    await supabase.from("transactions").insert({
      user_id: userId,
      razorpay_order_id,
      razorpay_payment_id,
      amount_inr: selected.amount * 100,
      credits: selected.credits,
      status: updateErr ? "paid_credit_failed" : "paid",
    });

    if (updateErr) {
      return res.status(500).json({ success: false, error: "Credit update failed — contact support" });
    }

    return res.status(200).json({ success: true, creditsAdded: selected.credits });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
