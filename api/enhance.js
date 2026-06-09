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
    const { image, scale, userId, email } = req.body;

    // 1. Check if user identification keys are present
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required.' });
    }

    // 2. QUERY SUPABASE FOR THE USER'S CREDIT BALANCE
    let profile = null;
    let fetchError = null;

    if (userId === "CHECK_SESSION_BY_HEADER_EMAIL" && email) {
      const cleanEmail = email.replace(/[\(\)\s]/g, '').toLowerCase();
      
      const { data: profiles, error: emailError } = await supabase
        .from('profiles') 
        .select('*')
        .ilike('email', cleanEmail)
        .limit(1);
        
      if (profiles && profiles.length > 0) profile = profiles[0];
      fetchError = emailError;
    } else {
      const { data: uProfile, error: idError } = await supabase
        .from('profiles')
        .select('credits, id')
        .eq('id', userId)
        .single();
        
      profile = uProfile;
      fetchError = idError;
    }

    // Fallback: Prevent a 500 crash if profile is missing
    if (fetchError || !profile) {
      return res.status(403).json({ error: 'Insufficient balance' });
    }

    // 3. THE CREDIT GUARD: Block them immediately if they have 0 credits
    const currentCredits = parseInt(profile.credits, 10) || 0;
    if (currentCredits <= 0) {
      return res.status(403).json({ error: 'Insufficient balance' });
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
        version: "660d9222203be9b95941da991e6013fe3571d1ead7f3cdac3bbbc0ba227571d1", 
        input: {
          image: image,
          scale: parseInt(scale, 10) || 2,
          face_enhance: true
        }
      })
    });

    // Catch if Replicate rejects the initial request
    if (!replicateResponse.ok) {
      const errorData = await replicateResponse.json().catch(() => ({}));
      return res.status(replicateResponse.status).json({ error: errorData.detail || 'AI Engine initialization failed' });
    }

    const prediction = await replicateResponse.json();

    // SAFEGUARD FIXED HERE: Ensure prediction and urls exist before checking prediction.urls.get
    if (!prediction || !prediction.urls || !prediction.urls.get) {
      return res.status(500).json({ error: 'Failed to establish tracking route with AI engine.' });
    }

    // 6. POLL REPLICATE UNTIL IMAGE IS READY
    let finalOutputUrl = null;
    while (!finalOutputUrl) {
      const pollResponse = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
      });
      
      if (!pollResponse.ok) {
        return res.status(500).json({ error: 'AI status tracking failed.' });
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
      .update({ credits: Math.max(0, currentCredits - 1) })
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
