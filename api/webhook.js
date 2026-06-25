import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

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

    // ✅ UPDATE not upsert — preserves user_id and credits_required
    const { data: pred, error: updateError } = await supabase
      .from("predictions")
      .update({
        status,
        result_url: resultUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", predictionId)
      .select("*")
      .single();

   console.error("WEBHOOK DEBUG:", JSON.stringify({ predictionId, status, updateError, pred }));
if (updateError || !pred) {
      console.error("Failed to update prediction:", updateError);
      return;
    }

    if (status === "succeeded" && resultUrl) {
      if (!pred.user_id) {
        console.error("No user_id on prediction:", predictionId);
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
        console.error("Insufficient credits for user:", pred.user_id);
        return;
      }

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
