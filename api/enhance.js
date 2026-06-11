import { createClient } from '@supabase/supabase-sea';

// Safe initialized fallback check for backend orchestration environments
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // Enforce proper cross-origin option request protocols
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not explicitly allowed by API rules.' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { image, email, userId } = req.body || {};

    // Validate that an actual source image is present inside the request parameters
    if (!image) {
      return res.status(400).json({ error: 'Image processing failed: No source image file URL detected.' });
    }

    // Target identifier resolution step: extract either a user email address or a unique account ID
    const userLookupValue = email || userId;
    if (!userLookupValue) {
      return res.status(400).json({ error: 'Authentication matching failed: User context must include an email or ID parameter.' });
    }

    // Database lookup query execution phase
    let profileQuery = supabase.from('profiles').select('credits');
    
    if (email) {
      profileQuery = profileQuery.eq('email', email);
    } else {
      profileQuery = profileQuery.eq('id', userId);
    }

    const { data: profile, error: dbError } = await profileQuery.single();

    if (dbError || !profile) {
      console.error("Supabase profile location error log:", dbError);
      return res.status(404).json({ error: 'System profile matching failed: Target account profile entry could not be located.' });
    }

    // Balance check: confirm user has at least 1 credit to proceed
    const currentBalance = parseInt(profile.credits, 10);
    if (isNaN(currentBalance) || currentBalance < 1) {
      return res.status(403).json({ error: 'Transaction rejected: Your account has an insufficient available token balance.' });
    }

    // Deduct one processing credit transaction step
    const updatedBalance = currentBalance - 1;
    let balanceUpdateQuery = supabase.from('profiles').update({ credits: updatedBalance });

    if (email) {
      balanceUpdateQuery = balanceUpdateQuery.eq('email', email);
    } else {
      balanceUpdateQuery = balanceUpdateQuery.eq('id', userId);
    }

    const { error: updateError } = await balanceUpdateQuery;
    if (updateError) {
      throw new Error(`Credit processing ledger transaction crash: ${updateError.message}`);
    }

    // Mock response placeholder for testing connection stability
    return res.status(200).json({
      success: true,
      remainingCredits: updatedBalance,
      enhancedImage: image // Temporary echo mirror to confirm script stability
    });

  } catch (globalCatchError) {
    console.error("Global API orchestration error event log:", globalCatchError);
    return res.status(500).json({ error: 'An unexpected internal routing exception broke compilation processing.', details: globalCatchError.message });
  }
}
