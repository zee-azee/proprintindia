import { createClient } from '@supabase/supabase-js';

// Initialize the secure admin Supabase client using Vercel Environment Variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, scale, userId } = req.body;

    // 1. Check if a valid userId was provided by the frontend dashboard
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required. Please log in again.' });
    }

    // 2. QUERY SUPABASE FOR THE USER'S CREDIT BALANCE (WITH EMAIL FALLBACK)
    let profile = null;
    let fetchError = null;

    if (userId === "CHECK_SESSION_BY_HEADER_EMAIL") {
      // Fallback: Use the known account email to find the user profile row
      const { data: profiles, error: emailError } = await supabase
        .from('profiles') // Ensure this matches your exact table name ('profiles' or 'users')
        .select('*')
        .eq('email', 'banugulshan031@gmail.com')
        .limit(1);
        
      if (profiles && profiles.length > 0) {
        profile = profiles[0];
      }
      fetchError = emailError;
    } else {
      // Standard accurate lookup via the unique Auth ID string
      const { data: uProfile, error: idError } = await supabase
        .from('profiles')
        .select('credits, id')
        .eq('id', userId)
        .single();
        
      profile = uProfile;
      fetchError = idError;
    }

    // Check if the query itself failed or if the user record doesn't exist
    if (fetchError || !profile) {
      return res.status(404).json({ error: 'User profile or credit balance database records could not be verified.' });
    }

    // 3. THE CREDIT GUARD: Block them immediately if they are out of credits
    if (parseInt(profile.credits) <= 0) {
      return res.status(403).json({ error: 'Insufficient balance. Please buy credits!' });
    }

    // 4. VALIDATE REPLICATE TOKEN AVAILABILITY
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Server configuration error: Missing API Token.' });
    }

    // 5. RUN YOUR ACTIVE REPLICATE AI UPSCALER ENGINE
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "660d9222203be9b95941da991e6013fe3571d1ead7f3cdac3bbbc0ba227571d1", // Real Esrgan/SDXL upscaler string
        input: {
          image: image,
          scale: parseInt(scale) || 2,
          face_enhance: true
        }
      })
    });

    if (!replicateResponse.ok) {
      const errorData = await replicateResponse.json().catch(() => ({}));
      return res.status(replicateResponse.status).json({ error: errorData.detail || 'Replicate engine failure' });
    }

    const prediction = await replicateResponse.json();

    // 6. POLL REPLICATE UNTIL IMAGE IS READY
    let finalOutputUrl = null;
    while (!finalOutputUrl) {
      const pollResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      
      if (!pollResponse.ok) {
        return res.status(500).json({ error: 'AI status tracking tracking failed.' });
      }

      const pollData = await pollResponse.json();

      if (pollData.status === 'succeeded') {
        finalOutputUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
        return res.status(500).json({ error: 'AI processing task failed on execution.' });
      }

      // Wait 1.5 seconds before asking again to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 7. DEDUCT 1 CREDIT FROM SUPABASE UPON SUCCESSFUL UPSCALING
    const targetLookupId = profile.id;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: parseInt(profile.credits) - 1 })
      .eq('id', targetLookupId);

    if (updateError) {
      console.error("Database deduction failed:", updateError);
    }

    // 8. SEND FINAL IMAGE BACK TO FRONTEND
    return res.status(200).json({ success: true, output: finalOutputUrl });

  } catch (error) {
    console.error('Backend Processing Error:', error);
    return res.status(500).json({ error: error.message || 'Fatal internal processing breakdown.' });
  }
}
