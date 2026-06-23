
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const replicateToken = process.env.REPLICATE_API_TOKEN;
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id, userId } = req.query;
  if (!userId) {
  return res.status(400).json({ error: 'No user ID provided.' });
}

  if (!id) {
    return res.status(400).json({ error: 'No prediction ID provided.' });
  }

  try {
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${id}`,
      {
        headers: {
          Authorization: `Token ${replicateToken}`,
        },
      }
    );

    const data = await pollRes.json();
    if (data.status === 'failed') {

  await supabase
    .from('enhancements')
    .update({
      status: 'failed'
    })
    .eq('prediction_id', id);

  return res.status(200).json({
    status: 'failed',
    error: data.error
  });

}

    // Prediction completed
    if (data.status === 'succeeded' && data.output) {
      const replicateUrl = Array.isArray(data.output)
        ? data.output[0]
        : data.output;

      // Download image from Replicate
      const imageRes = await fetch(replicateUrl);
      const imageBuffer = await imageRes.arrayBuffer();

      // Upload to Supabase Storage
      const fileName = `${userId}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('enhanced-images')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from('enhanced-images')
        .getPublicUrl(fileName);
      await supabase
  .from('enhancements')
  .update({
    status: 'completed',
    result_url: publicData.publicUrl
  })
  .eq('prediction_id', id);

      return res.status(200).json({
        status: 'succeeded',
        output: publicData.publicUrl,
        error: null,
      });
    }

    return res.status(200).json({
      status: data.status,
      output: null,
      error: data.error || null,
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Poll failed.',
      details: err.message,
    });
  }
}
