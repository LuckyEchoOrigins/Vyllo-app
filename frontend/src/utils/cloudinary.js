const CLOUDINARY_CLOUD_NAME = 'slkkeoam'

// O Cloudinary só consegue ir buscar URLs públicos (http/https). Capas locais
// — data: (foto carregada pelo utilizador) ou blob: — não podem ser otimizadas
// e, se fossem enviadas, iam parar a um terceiro (a foto do utilizador vai
// inteira dentro do URL). Devolvem-se intactas.
function isLocalImage(url) {
  return url.startsWith('data:') || url.startsWith('blob:')
}

export function optimizeImageUrl(url) {
  if (!url) return url
  if (isLocalImage(url)) return url

  // Se já é uma URL do Cloudinary, retorna como está
  if (url.includes('res.cloudinary.com')) return url

  // Converte para URL otimizada do Cloudinary
  // w_400: width 400px (redimensiona)
  // q_auto: qualidade automática
  // f_auto: formato automático (WebP para browsers que suportam)
  const encodedUrl = encodeURIComponent(url)
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_400,q_auto,f_auto/${encodedUrl}`
}

export function optimizeImageUrlLarge(url) {
  if (!url) return url
  if (isLocalImage(url)) return url
  if (url.includes('res.cloudinary.com')) return url

  const encodedUrl = encodeURIComponent(url)
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_800,q_auto,f_auto/${encodedUrl}`
}
