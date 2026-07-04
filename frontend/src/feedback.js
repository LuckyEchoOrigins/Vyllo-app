// Sistema de feedback global (toasts + diálogos de confirmação no tema da app)
// Usa eventos no window — não precisa de Context/Provider.

let _id = 0

// Vibração tátil leve (Android; ignorado onde não há suporte)
export function haptic(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms) } catch {}
}

export function showToast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('vyllo-toast', { detail: { id: ++_id, message, type } }))
}

// Confirmação estilizada — devolve uma Promise<boolean>
export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {})
  return new Promise(resolve => {
    const id = ++_id
    const onResult = (e) => {
      if (e.detail.id !== id) return
      window.removeEventListener('vyllo-confirm-result', onResult)
      resolve(!!e.detail.ok)
    }
    window.addEventListener('vyllo-confirm-result', onResult)
    window.dispatchEvent(new CustomEvent('vyllo-confirm', {
      detail: {
        id,
        title: o.title || 'Confirm',
        message: o.message || '',
        confirmLabel: o.confirmLabel || 'Confirm',
        cancelLabel: o.cancelLabel || 'Cancel',
        danger: !!o.danger,
      },
    }))
  })
}
