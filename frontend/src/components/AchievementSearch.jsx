// Botão de vidro com lupa + barra de pesquisa de proezas (reutilizado em Steam e consolas)

export function SearchToggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Procurar proeza"
      style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on
          ? 'rgba(255,255,255,0.32)'
          : 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
        backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--item-glass-border)', cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        transition: 'background 0.15s',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    </button>
  )
}

export function SearchBar({ value, onChange, onClear }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      borderRadius: 12, padding: '8px 12px',
      background: 'linear-gradient(150deg, var(--item-glass-1), var(--item-glass-2))',
      backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--item-glass-border)',
      animation: 'fadeInUp 0.2s ease both',
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--item-label)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={onChange}
        placeholder="Procurar proeza..."
        autoFocus
        style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, fontSize: 13, color: 'var(--text)' }}
      />
      {value && (
        <button onClick={onClear} style={{ background: 'none', padding: 0, display: 'flex', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--item-label)" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  )
}
