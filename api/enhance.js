import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { image, userId, scale = 2 } = req.body || {};

    if (!image) return res.status(400).json({ error: 'No image provided.' });
    if (!userId) return res.status(400).json({ error: 'No userId provided.' });

    // Check credits
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (dbError || !profile) return res.status(404).json({ error: 'Profile not found.' });

    const currentBalance = parseInt(profile.credits, 10);
    if (isNaN(currentBalance) || currentBalance < 1) {
      return res.status(403).json({ error: 'Insufficient balance. Please buy credits!' });
    }

    // Deduct credit
    const updatedBalance = currentBalance - 1;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: updatedBalance })
      .eq('id', userId);

    if (updateError) throw new Error(updateError.message);

    // Send to Replicate for real upscaling
    const startRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
        input: {
          image: image,
          scale: scale
        }
      })
    });

    const prediction = await startRes.json();

    if (!prediction?.id) {
      throw new Error('Replicate did not return a prediction ID.');
    }

    // Poll for result (max 60 seconds)
    let result = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${replicateToken}` }
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'succeeded') {
        result = pollData.output;
        break;
      }
      if (pollData.status === 'failed') {
        throw new Error('Replicate enhancement failed.');
      }
    }

    if (!result) throw new Error('Enhancement timed out.');

    return res.status(200).json({
      success: true,
      remainingCredits: updatedBalance,
      enhancedImage: result
    });

  } catch (err) {
    console.error('Enhance error:', err);
    return res.status(500).json({ error: 'Enhancement failed.', details: err.message });
  }
}
