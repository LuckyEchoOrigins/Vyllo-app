// Deteta se a Vyllo está a correr dentro de um wrapper nativo (a app do iOS ou
// o TWA do Android) em vez de um browser normal.
//
// Estratégia FAIL-OPEN: qualquer sinal de "estou numa app" conta como app. Mais
// vale deixar passar um utilizador de browser do que bloquear, por engano, um
// utilizador real das lojas — cujo ecrã ficaria preso na página de download.

export function isNativeApp() {
  if (typeof window === 'undefined') return true
  try {
    // iOS: o wrapper acrescenta "PWAShell" ao user agent e regista handlers.
    if (/PWAShell/i.test(navigator.userAgent)) return true
    if (window.webkit?.messageHandlers?.['app-ready']) return true

    // Android TWA: aberto a partir do pacote, ou a correr em janela standalone
    // (o referrer só existe no primeiro carregamento, por isso o display-mode
    // é a rede de segurança que persiste durante toda a sessão).
    if (document.referrer.startsWith('android-app://')) return true
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  } catch {
    return true // na dúvida, mostra a app
  }
  return false
}

// Interruptor de bloqueio da web. Enquanto as apps não estão publicadas nas
// lojas, isto fica FALSE (a web funciona, os testers usam-na). Ao lançar,
// muda para true: o browser passa a ver a página "descarrega nas lojas", e as
// apps nativas continuam a funcionar (passam sempre em isNativeApp()).
export const BLOCK_WEB = false
