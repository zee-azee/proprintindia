import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  try {
    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey
    );

    const { image, userId, scale = 2 } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: 'No image provided.'
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'No userId provided.'
      });
    }

    // Get user credits
    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
      return res.status(404).json({
        error: 'Profile not found.'
      });
    }

    const currentBalance =
      parseInt(profile.credits, 10);

    const creditsRequired =
      scale === 4 ? 3 : 1;

    if (
      isNaN(currentBalance) ||
      currentBalance < creditsRequired
    ) {
      return res.status(403).json({
        error: 'Insufficient balance. Please buy credits!'
      });
    }

    // Deduct credits
    await supabase
      .from('profiles')
      .update({
        credits: currentBalance - creditsRequired
      })
      .eq('id', userId);

    // Start Replicate prediction
    const startRes = await fetch(
      'https://api.replicate.com/v1/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${replicateToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version:
            'dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
          input: {
            image,
            scale
          }
        })
      }
    );

    const prediction = await startRes.json();

    if (!prediction?.id) {
      throw new Error(
        'Replicate did not return a prediction ID.'
      );
    }

    // Save enhancement job
    const { error: enhancementError } =
      await supabase
        .from('enhancements')
        .insert({
          user_id: userId,
          prediction_id: prediction.id,
          filename: 'uploaded-image',
          tool:
            scale === 4
              ? 'Wallpaper Pro'
              : 'Quick Crisp',
          status: 'processing',
          credits_used: creditsRequired
        });

    if (enhancementError) {
      console.error(
        'Enhancement insert error:',
        enhancementError
      );
      throw enhancementError;
    }

    return res.status(200).json({
      success: true,
      predictionId: prediction.id,
      remainingCredits:
        currentBalance - creditsRequired
    });

  } catch (err) {
    console.error(
      'Enhance error:',
      err
    );

    return res.status(500).json({
      error: 'Enhancement failed.',
      details: err.message
    });
  }
}
