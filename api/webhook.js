import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // ✅ Respond immediately so Replicate marks webhook as delivered
  res.status(200).end();

  try {
    const event = req.body;
    const predictionId = event.id;
    const status = event.status;

    if (!predictionId) return;

    const resultUrl =
      status === "succeeded"
        ? Array.isArray(event.output)
          ? event.output[0]
          : event.output
        : null;

    // Update prediction status
    await supabase.from("predictions").upsert({
      id: predictionId,
      status,
      result_url: resultUrl,
      completed_at: new Date().toISOString(),
    });

    // Only deduct credits on success
    if (status === "succeeded" && resultUrl) {
      const { data: pred } = await supabase
        .from("predictions")
        .select("*")
        .eq("id", predictionId)
        .single();

      if (!pred?.user_id) {
        console.error("No prediction found for id:", predictionId);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", pred.user_id)
        .single();

      const currentCredits = profile?.credits || 0;
      const creditsToDeduct = pred.credits_required || 1;

      if (currentCredits < creditsToDeduct) {
        console.error("Insufficient credits for webhook completion");
        return;
      }

      // Deduct credits
      await supabase
        .from("profiles")
        .update({ credits: currentCredits - creditsToDeduct })
        .eq("id", pred.user_id);

      console.log(`✅ Credits deducted for user ${pred.user_id}: -${creditsToDeduct}`);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
}
