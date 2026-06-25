import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const {
      imageBase64,
      userId,
      tool,
      filename = "uploaded-image",
    } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        error: "No image provided.",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "No userId provided.",
      });
    }

    // -----------------------------
    // Credits required
    // -----------------------------

    let creditsRequired = 1;

    if (tool === "Wallpaper Pro") {
      creditsRequired = 10;
    }

    if (tool === "Face Enhancer") {
      creditsRequired = 2;
    }

    // -----------------------------
    // Check credits
    // -----------------------------

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    if (profile.credits < creditsRequired) {
      return res.status(403).json({
        error: "Insufficient credits.",
      });
    }

    // -----------------------------
    // Replicate Model
    // -----------------------------

    let version = "";
    let input = {};

    // Quick Crisp
    if (tool === "Quick Crisp") {
      version =
        "7135ff723ecea89c0f67afcd51e4904904586e351093465bdc7beed45941b3e0";

      input = {
        image: imageBase64,
        upscale_mode: "target",
        target: 4,
        enhance_details: true,
        enhance_realism: true,
        output_format: "jpg",
        output_quality: 90,
      };
    }

    // Wallpaper Pro
    else if (tool === "Wallpaper Pro") {
      version =
        "96c34bbe9aae48023bb102b0386f62a88ecd05bcdac34e95ca10857af055e895";

      input = {
        image: imageBase64,
        scale_factor: 4,
        dynamic: 6,
        creativity: 0.35,
        resemblance: 0.6,
        tiling_width: 112,
        tiling_height: 144,
        num_inference_steps: 30,
        scheduler: "DPM++ 3M SDE Karras",
      };
    }

    // Face Enhancer
    else {
      version =
        "297a243ce8643961d52f745f9b6c8c1bd96850a51c92be5f43628a0d3e08321a";

      input = {
        img: imageBase64,
        scale: 2,
      };
    }

    // -----------------------------
    // Start Replicate
    // -----------------------------

    const prediction = await replicate.predictions.create({
      version,
      input,
      webhook: "https://www.proprintindia.com/api/webhook",
      webhook_events_filter: ["completed"],
    });

    // -----------------------------
    // Save Prediction
    // -----------------------------

    const { error: insertError } = await supabase
      .from("predictions")
      .insert({
        id: prediction.id,
        user_id: userId,
        status: prediction.status,
        tool,
        filename,
        credits_required: creditsRequired,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(insertError);
    }

    return res.status(200).json({
      success: true,
      predictionId: prediction.id,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
