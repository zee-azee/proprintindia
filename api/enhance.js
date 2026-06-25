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
    const creditsMap = {
      quickcrisp: 1,
      wallpaperpro: 10,
      faceenhancer: 2,
    };

    const creditsRequired = creditsMap[tool] || 1;

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
    let modelVersion;
    let modelName;

    if (tool === "wallpaperpro") {
      modelName = "philz1337x/clarity-upscaler";
      modelVersion = null;
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
    } else if (tool === "faceenhancer") {
      modelName = null;
      modelVersion = "7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56";
      predictionInput = {
        image: imageBase64,
        fidelity: 0.75,
        upscale: 2,
        face_upsample: true,
        background_enhance: true,
      };
    } else {
      // quickcrisp
      modelName = null;
      modelVersion = "7135ff723ecea89c0f67afcd51e4904904586e351093465bdc7beed45941b3e0";
      predictionInput = {
        image: imageBase64,
        upscale_mode: "target",
        target: 4,
        enhance_details: true,
        enhance_realism: true,
        output_format: "jpg",
        output_quality: 90,
      };
    }

    // Start Replicate prediction
    const predictionParams = {
      input: predictionInput,
      webhook: `https://proprintindia.com/api/webhook`,
      webhook_events_filter: ["completed"],
    };

    if (modelVersion) {
      predictionParams.version = modelVersion;
    } else {
      predictionParams.model = modelName;
    }

    const prediction = await replicate.predictions.create(predictionParams);

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
