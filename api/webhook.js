import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const event = req.body;
    const predictionId = event.id;
    const status = event.status;

    if (!predictionId) return res.status(400).end();

    const resultUrl =
      status === "succeeded"
        ? Array.isArray(event.output)
          ? event.output[0]
          : event.output
        : null;

    // Do all DB work FIRST, then respond
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

    console.log("Update result:", JSON.stringify({ pred, updateError }));

    if (pred && status === "succeeded" && resultUrl && pred.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", pred.user_id)
        .single();

      const currentCredits = profile?.credits || 0;
      const creditsToDeduct = pred.credits_required || 1;

      if (currentCredits >= creditsToDeduct) {
        await supabase
          .from("profiles")
          .update({ credits: currentCredits - creditsToDeduct })
          .eq("id", pred.user_id);
        console.log(`✅ Credits deducted: -${creditsToDeduct}`);
      }
    }

    // Respond AFTER all work is done
    return res.status(200).end();

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(200).end();
  }
}
