const CLOUDINARY_CLOUD_NAME = 'slkkeoam'

export function optimizeImageUrl(url) {
  if (!url) return url

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
  if (url.includes('res.cloudinary.com')) return url

  const encodedUrl = encodeURIComponent(url)
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_800,q_auto,f_auto/${encodedUrl}`
}
