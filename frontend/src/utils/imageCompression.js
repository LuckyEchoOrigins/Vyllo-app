/**
 * Comprime uma imagem para um tamanho máximo
 * Reduz para ~200KB ou menos
 */
export async function compressImage(file) {
  if (!file) return null

  // Se já é data URL, descodificar
  if (typeof file === 'string' && file.startsWith('data:')) {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Redimensiona se for muito grande (max 1200px)
        if (width > 1200 || height > 1200) {
          const ratio = Math.min(1200 / width, 1200 / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Comprime com qualidade 0.7 (boa qualidade, tamanho pequeno)
        let quality = 0.7
        let dataUrl = canvas.toDataURL('image/jpeg', quality)

        // Se ainda for muito grande, reduz qualidade
        while (dataUrl.length > 250000 && quality > 0.3) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }

        resolve(dataUrl)
      }

      img.onerror = () => reject(new Error('Failed to load image'))
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Comprime múltiplas imagens
 */
export async function compressImages(files) {
  return Promise.all(files.map(f => compressImage(f)))
}
