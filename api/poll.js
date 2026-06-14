const replicateToken = process.env.REPLICATE_API_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'No prediction ID provided.' });

  try {
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Token ${replicateToken}` }
    });

    const data = await pollRes.json();

    return res.status(200).json({
      status: data.status,
      output: data.output || null,
      error: data.error || null
    });

  } catch (err) {
    return res.status(500).json({ error: 'Poll failed.', details: err.message });
  }
}
