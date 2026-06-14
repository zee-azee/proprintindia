import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not explicitly allowed by API rules.' });
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { image, userId } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Image processing failed: No source image file URL detected.' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'Authentication failed: userId is required.' });
    }

    // Lookup profile by userId only
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (dbError || !profile) {
      console.error("Supabase profile error:", dbError);
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

    const currentBalance = parseInt(profile.credits, 10);
    if (isNaN(currentBalance) || currentBalance < 1) {
      return res.status(403).json({ error: 'Transaction rejected: Your account has an insufficient available token balance.' });
    }

    const updatedBalance = currentBalance - 1;

    // Deduct credit by userId only
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: updatedBalance })
      .eq('id', userId);

    if (updateError) {
      throw new Error(`Credit update failed: ${updateError.message}`);
    }

    return res.status(200).json({
      success: true,
      remainingCredits: updatedBalance,
      enhancedImage: image
    });

  } catch (globalCatchError) {
    console.error("Global error:", globalCatchError);
    return res.status(500).json({ error: 'Internal server error.', details: globalCatchError.message });
  }
}
