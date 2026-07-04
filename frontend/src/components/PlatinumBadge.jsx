import Icon from './Icon'

// Troféu dourado — mostrado nos jogos com 100% das proezas desbloqueadas
export default function PlatinumBadge({ size = 22, style }) {
  return (
    <div
      title="Todas as proezas desbloqueadas"
      style={{
        position: 'absolute',
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #FFE27A, #F5A623)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35), 0 0 0 2px #fff',
        zIndex: 3,
        ...style,
      }}
    >
      <Icon name="trophy" size={size * 0.56} strokeWidth={2.4} />
    </div>
  )
}
