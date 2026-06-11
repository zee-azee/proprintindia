import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://mhqlqnsymvfkqedqmhqy.supabase.co",
process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
try {
const {
razorpay_order_id,
razorpay_payment_id,
razorpay_signature,
amount,
userId
} = req.body;

```
const expectedSignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
  .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  .digest("hex");

if (expectedSignature !== razorpay_signature) {
  return res.status(400).json({
    success: false,
    error: "Invalid payment signature"
  });
}

let creditsToAdd = 0;

switch (Number(amount)) {
  case 199:
    creditsToAdd = 20;
    break;

  case 499:
    creditsToAdd = 60;
    break;

  case 999:
    creditsToAdd = 150;
    break;

  case 599:
    creditsToAdd = 5;
    break;

  case 1499:
    creditsToAdd = 15;
    break;

  case 3499:
    creditsToAdd = 40;
    break;

  default:
    return res.status(400).json({
      success: false,
      error: "Invalid plan amount"
    });
}

const { data: profile } = await supabase
  .from("profiles")
  .select("credits")
  .eq("id", userId)
  .single();

const currentCredits = profile?.credits || 0;

await supabase
  .from("profiles")
  .update({
    credits: currentCredits + creditsToAdd
  })
  .eq("id", userId);

return res.status(200).json({
  success: true,
  creditsAdded: creditsToAdd
});
```

} catch (err) {
return res.status(500).json({
success: false,
error: err.message
});
}
}
