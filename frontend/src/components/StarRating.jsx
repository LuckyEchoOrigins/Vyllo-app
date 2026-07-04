import { haptic } from '../feedback'

export default function StarRating({ value, onChange, readonly = false }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => { if (!readonly && onChange) { haptic(6); onChange(n === value ? 0 : n) } }}
          style={{
            background: 'none',
            padding: 2,
            cursor: readonly ? 'default' : 'pointer',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill={n <= (value || 0) ? '#F5A623' : 'none'} stroke={n <= (value || 0) ? '#F5A623' : '#DADAE8'} strokeWidth="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  )
}
