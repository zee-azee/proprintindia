import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { imageBase64, tool, userId } = req.body;

    if (!imageBase64 || !userId) {
      return res.status(400).json({ error: "Missing imageBase64 or userId" });
    }

    // Set credits based on tool
    const creditsRequired = tool === "wallpaper" ? 3 : 1;

    // Check user has enough credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (!profile || profile.credits < creditsRequired) {
      return res.status(402).json({ error: "Insufficient credits" });
    }

    // Choose model based on tool
    const model =
      tool === "wallpaper"
        ? "philz1337x/clarity-upscaler:dfad4170"
        : "philz1337x/clarity-upscaler:dfad4170";

    // Start Replicate prediction
    const prediction = await replicate.predictions.create({
      version: "dfad4170931de1b2f247c95419a9a44d970a5af9410dfea00e6811d86531a2e8",
      input: {
        image: imageBase64,
        scale_factor: tool === "wallpaper" ? 4 : 2,
      },
    webhook: `https://proprintindia.com/api/webhook`,
      webhook_events_filter: ["completed"],
    });

    // Save prediction to DB with user_id and credits_required
    await supabase.from("predictions").insert({
      id: prediction.id,
      user_id: userId,
      status: "starting",
      tool,
      credits_required: creditsRequired,
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({ predictionId: prediction.id });
  } catch (err) {
    console.error("Enhance error:", err);
    return res.status(500).json({ error: err.message });
  }
}
