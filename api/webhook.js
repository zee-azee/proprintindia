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

    // Always update prediction status first
    const resultUrl = status === "succeeded"
      ? (Array.isArray(event.output) ? event.output[0] : event.output)
      : null;

    await supabase.from("predictions").upsert({
      id: predictionId,
      status,
      result_url: resultUrl,
      completed_at: new Date().toISOString()
    });

    // Only deduct credits and log on success
    if (status === "succeeded" && resultUrl) {

      // Get prediction metadata from our DB
      const { data: pred } = await supabase
        .from("predictions")
        .select("*")
        .eq("id", predictionId)
        .single();

      if (!pred?.user_id) {
        console.error("No prediction found for id:", predictionId);
        return res.status(200).end();
      }

      // Get current credits
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", pred.user_id)
        .single();

      const currentCredits = profile?.credits || 0;
      const creditsToDeduct = pred.credits_required || 1;

      if (currentCredits < creditsToDeduct) {
        console.error("Insufficient credits for webhook completion");
        return res.status(200).end();
      }

      // Deduct credits
      await supabase
        .from("profiles")
        .update({ credits: currentCredits - creditsToDeduct })
        .eq("id",
