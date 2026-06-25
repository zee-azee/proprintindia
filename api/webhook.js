import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const prediction = req.body;

    const predictionId = prediction.id;
    const status = prediction.status;

    // Find prediction record
    const { data: job, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("id", predictionId)
      .single();

    if (error || !job) {
      return res.status(404).json({
        error: "Prediction not found",
      });
    }

    // --------------------------
    // FAILED
    // --------------------------

    if (status === "failed" || status === "canceled") {
      await supabase
        .from("predictions")
        .update({
          status,
        })
        .eq("id", predictionId);

      return res.status(200).end();
    }

    // --------------------------
    // NOT FINISHED YET
    // --------------------------

    if (status !== "succeeded") {
      await supabase
        .from("predictions")
        .update({
          status,
        })
        .eq("id", predictionId);

      return res.status(200).end();
    }

    // --------------------------
    // DOWNLOAD IMAGE
    // --------------------------

    const output = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;

    const imageResponse = await fetch(output);

    const imageBuffer = await imageResponse.arrayBuffer();

    // --------------------------
    // Upload to Storage
    // --------------------------

    const fileName = `${job.user_id}/${predictionId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("enhanced-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrl } = supabase.storage
      .from("enhanced-images")
      .getPublicUrl(fileName);

    // --------------------------
    // Deduct Credits
    // --------------------------

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", job.user_id)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({
          credits: profile.credits - job.credits_required,
        })
        .eq("id", job.user_id);
    }

    // --------------------------
    // Update Prediction
    // --------------------------

    await supabase
      .from("predictions")
      .update({
        status: "succeeded",
        result_url: publicUrl.publicUrl,
      })
      .eq("id", predictionId);

    return res.status(200).end();
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
