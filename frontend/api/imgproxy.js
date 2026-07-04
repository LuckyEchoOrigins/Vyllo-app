export default async function handler(req, res) {
  const { url } = req.query
  if (!url || typeof url !== 'string') return res.status(400).end()
  if (!url.startsWith('http://') && !url.startsWith('https://')) return res.status(400).end()

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Vyllo/1.0' } })
    if (!response.ok) return res.status(response.status).end()

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return res.status(400).end()

    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.send(Buffer.from(buffer))
  } catch {
    res.status(500).end()
  }
}
