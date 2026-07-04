// Ícones SVG coerentes para os estados (substituem os emojis ✅▶️📋🚫📦)
export default function StatusIcon({ status, size = 20, strokeWidth = 2, style }) {
  const c = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', style,
  }
  if (status === 'completed') {
    return <svg {...c}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
  }
  if (status === 'in_progress') {
    return <svg {...c}><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" /></svg>
  }
  if (status === 'wishlist') {
    return <svg {...c}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
  }
  if (status === 'abandoned') {
    return <svg {...c}><circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" /></svg>
  }
  // 'all' / total → caixa/pilha
  return <svg {...c}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
}
