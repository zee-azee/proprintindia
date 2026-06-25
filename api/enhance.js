import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   const {
  imageBase64,
  userId,
  scale = 2,
  filename = 'uploaded-image',
  tool = 'Quick Crisp'
} = req.body || {};
    if (!imageBase64)
  return res.status(400).json({ error: 'No image provided.' });
    if (!userId) return res.status(400).json({ error: 'No userId provided.' });

    const creditsRequired = scale === 4 ? 3 : 1;

    // Check credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError || !profile) return res.status(404).json({ error: 'Profile not found.' });

    const currentBalance = parseInt(profile.credits, 10);
    if (isNaN(currentBalance) || currentBalance < creditsRequired) {
      return res.status(403).json({ error: 'Insufficient balance. Please buy credits!' });
    }

    // Model version based on scale
    const version = scale === 4
      ? 'f201f0a4f89f2d1b5c41b54dd0669f44c59b674493e47a3e4f02791e0a3e74bc'
      : 'dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e';

    const inputParams = scale === 4
      ? {
          image: imageBase64,
          scale_factor: 2,
          prompt: "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>",
          negative_prompt: "(worst quality, low quality, normal quality:2)",
          creativity: 0.35,
          resemblance: 0.6,
          dynamic: 6,
          num_inference_steps: 18,
          output_format: "png",
          // Pass metadata so webhook can read it
          userId,
          tool,
          filename,
          credits: creditsRequired
        }
      : {
          image: imageBase64,
          scale,
          // Pass metadata so webhook can read it
          userId,
          tool,
          filename,
          credits: creditsRequired
        };

    // Fixed webhook URL
    const webhookUrl = 'https://www.proprintindia.com/api/webhook';

    const startRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${replicateToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version,
        input: inputParams,
        webhook: webhookUrl,
        webhook_events_filter: ["completed"]
      })
    });

    const prediction = await startRes.json();
    if (!prediction?.id) throw new Error('Replicate did not return a prediction ID.');

    // Store prediction in DB
    await supabase.from('predictions').upsert({
      id: prediction.id,
      user_id: userId,
      status: 'processing',
      tool,
      filename,
      credits_required: creditsRequired,
      created_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      predictionId: prediction.id,
      remainingCredits: currentBalance
    });

  } catch (err) {
    console.error('Enhance error:', err);
    return res.status(500).json({ error: 'Enhancement failed.', details: err.message });
  }
}
