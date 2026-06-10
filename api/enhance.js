import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, scale, userId, email, incomingPaymentAmount } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'User email is required' });
    }

    // 1. Fetch user profile or create a fresh one with 10 free credits if missing
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      // User doesn't exist in profiles table yet, insert them with 10 free credits!
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert([{ id: userId || null, email: email, credits: 10 }])
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: 'Failed to initialize free credits.' });
      }
      profile = newProfile;
    } else if (profileError) {
      return res.status(500).json({ error: 'Database access error.' });
    }

    let currentCredits = profile?.credits !== undefined ? profile.credits : 0;

    // 2. HANDLE PACKAGES RECHARGE (If a payment amount is passed)
    if (incomingPaymentAmount) {
      const amountPaid = Number(incomingPaymentAmount);
      let creditsToAdd = 0;

      // Quick Crisp Tier
      if (amountPaid === 199) creditsToAdd = 20;
      else if (amountPaid === 499) creditsToAdd = 60;
      else if (amountPaid === 999) creditsToAdd = 150;
      
      // Wallpaper Pro Tier
      else if (amountPaid === 599) creditsToAdd = 5;
      else if (amountPaid === 1499) creditsToAdd = 15;
      else if (amountPaid === 3499) creditsToAdd = 40;

      if (creditsToAdd > 0) {
        currentCredits += creditsToAdd;
        await supabase
          .from('profiles')
          .update({ credits: currentCredits })
          .eq('email', email);
          
        return res.status(200).json({ success: true, credits: currentCredits });
      }
    }

    // 3. Normal Enhancement Check: Verify if user has credits left
    if (currentCredits <= 0) {
      return res.status(403).json({ error: 'Insufficient balance. Please buy credits!' });
    }

    // 4. Deduct 1 credit for processing the upscale image
    const finalCredits = currentCredits - 1;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: finalCredits })
      .eq('email', email);

    if (updateError) {
      return res.status(500).json({ error: 'Could not process credit deduction.' });
    }

    // --- Placeholder for your Replicate / AI Upscale processing engine code ---
    // (Your existing generation code safely responds below)
    return res.status(200).json({ success: true, credits: finalCredits, output: ["https://via.placeholder.com/1000"] });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error processing operation.' });
  }
}
