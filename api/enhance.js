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

    // Credits per tool
    const creditsRequired = tool === "wallpaperpro" ? 10 : 1;

    // Check credits
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "User not found" });
    }

    if (profile.credits < creditsRequired) {
      return res.status(402).json({ error: "Insufficient credits" });
    }

    // Build input based on tool
    let predictionInput;
    let modelName;

    if (tool === "wallpaperpro") {
      modelName = "philz1337x/clarity-upscaler";
      predictionInput = {
        image: imageBase64,
        scale_factor: 4,
        dynamic: 6,
        creativity: 0.35,
        resemblance: 0.6,
        tiling_width: 112,
        tiling_height: 144,
        num_inference_steps: 30,
        scheduler: "DPM++ 3M SDE Karras",
        negative_prompt: "blur, lowres, bad anatomy, jpeg artifacts, watermark",
      };
    } else {
      // quickcrisp
      modelName = "nightmareai/real-esrgan";
      predictionInput = {
        image: imageBase64,
        scale: 2,
        face_enhance: false,
      };
    }

    // Start Replicate prediction
    const prediction = await replicate.predictions.create({
      model: modelName,
      input: predictionInput,
      webhook: `https://proprintindia.com/api/webhook`,
      webhook_events_filter: ["completed"],
    });

    // Save prediction to DB
    const { error: insertError } = await supabase.from("predictions").insert({
      id: prediction.id,
      user_id: userId,
      status: "starting",
      tool,
      credits_required: creditsRequired,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to insert prediction:", insertError);
      return res.status(500).json({ error: "Failed to save prediction" });
    }

    return res.status(200).json({ predictionId: prediction.id });

  } catch (err) {
    console.error("Enhance error:", err);
    return res.status(500).json({ error: err.message });
  }
}
