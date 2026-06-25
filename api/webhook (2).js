import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const event = req.body;

    // Only handle succeeded predictions
    if (event.status !== "succeeded") return res.status(200).end();

    const { id, output, input } = event;
    const userId = input?.userId;
    const tool = input?.tool;
    const filename = input?.filename;
    const creditsToDeduct = input?.credits;

    if (!userId || !creditsToDeduct) return res.status(400).end();

    const resultUrl = Array.isArray(output) ? output[0] : output;

    // Deduct credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    const currentCredits = profile?.credits || 0;
    if (currentCredits < creditsToDeduct) {
      console.error("Insufficient credits for webhook completion");
      return res.status(200).end();
    }

    await supabase
      .from("profiles")
      .update({ credits: currentCredits - creditsToDeduct })
      .eq("id", userId);

    // Log enhancement
    await supabase.from("enhancements").insert({
      user_id: userId,
      tool,
      filename,
      credits_used: creditsToDeduct,
      result_url: resultUrl,
    });

    // Update prediction so frontend polling picks it up
    await supabase.from("predictions").upsert({
      id,
      user_id: userId,
      status: "succeeded",
      result_url: resultUrl,
      completed_at: new Date().toISOString(),
    });

    return res.status(200).end();

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).end();
  }
}
