export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. REMOVED apiKey from req.body to prevent the frontend from needing to send it
    const { image, scale } = req.body;

    // 2. GRAB the key securely from Vercel's backend environment variables instead
    const secureApiKey = process.env.REPLICATE_API_TOKEN;

    if (!image) {
      return res.status(400).json({ error: 'Missing image data' });
    }
    
    if (!secureApiKey) {
      return res.status(500).json({ error: 'Server configuration error: Replicate API token missing on backend.' });
    }

    // Call Replicate API from server side — no CORS issues
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${secureApiKey}`, // Uses the secure backend token
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        version: 'd0ee3d708c9b911f122a4ad90046c5d26a0293b99476d697f6bb7f2e251ce2d4',
        input: {
          image: image,
          scale: scale ? parseInt(scale) : 4,
          face_enhance: false
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || 'Replicate API error' });
    }

    // If still processing, poll for result
    if (data.status === 'processing' || data.status === 'starting') {
      let prediction = data;
      let attempts = 0;

      while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { 'Authorization': `Token ${secureApiKey}` } // Uses secure backend token
        });

        prediction = await pollRes.json();
      }

      if (prediction.status === 'failed') {
        return res.status(500).json({ error: prediction.error || 'Enhancement failed' });
      }

      return res.status(200).json({ output: prediction.output });
    }

    return res.status(200).json({ output: data.output });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
