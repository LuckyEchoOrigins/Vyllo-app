import { CAT_COLOR, CAT_LIGHT } from './utils'

// ── Temas de cor (acento) — perk Premium ──
// Cada tema recolore a app INTEIRA. Para adicionar um novo, basta uma entrada aqui
// (acento, gradiente da marca, glow e cores de categoria) — não é preciso mexer no CSS.
export const ACCENTS = {
  purple: {
    label: 'Purple',
    accent: '#6C47FF', accent2: '#9B72FF',
    light: '#EDE8FF', lightDark: '#2C2740',
    brand: ['#F7901E', '#E0459E', '#7C3AED'],   // gradiente da marca (arco-íris original)
    rgb: '108,71,255',                           // glow
    cat:      { book: '#7C3AED', game: '#E0459E', film: '#F7901E' },
    catLight: { book: '#EDE8FF', game: '#FCE3F0', film: '#FEF3E0' },
  },
  emerald: {
    label: 'Emerald',
    accent: '#25C06B', accent2: '#6FE3A0',
    light: '#E1F8EC', lightDark: '#143026',
    brand: ['#6FE3A0', '#25C06B', '#0E7C50'],
    rgb: '37,192,107',
    cat:      { book: '#0E8C7A', game: '#22A85F', film: '#7BBF3A' },
    catLight: { book: '#DDF3EF', game: '#E1F4E9', film: '#EDF6DC' },
  },
  aurora: {
    label: 'Aurora',
    accent: '#3B82F6', accent2: '#6D6AF0',
    light: '#E6EFFD', lightDark: '#16243C',
    brand: ['#17B6CE', '#3B82F6', '#6D6AF0'],
    rgb: '59,130,246',
    cat:      { book: '#17B6CE', game: '#3B82F6', film: '#6D6AF0' },   // Livros=Aqua · Jogos=Azure · Filmes=Indigo
    catLight: { book: '#E2F6F9', game: '#E6EFFD', film: '#ECEBFE' },
  },
  fire: {
    label: 'Fire',
    accent: '#F2541B', accent2: '#F5A524',
    light: '#FDEDE0', lightDark: '#3A2317',
    brand: ['#F5A524', '#FF6B2C', '#E03048'],   // âmbar → laranja → carmim
    rgb: '255,107,44',
    cat:      { book: '#E08A0F', game: '#E0303F', film: '#FF6B2C' },   // Livros=Âmbar · Jogos=Carmim · Filmes=Laranja
    catLight: { book: '#FCEFD5', game: '#FBE0E3', film: '#FDE8DC' },
  },
  primary: {
    label: 'Primary',
    accent: '#2563EB', accent2: '#5B8DEF',
    light: '#E7EEFD', lightDark: '#16223F',
    brand: ['#E63946', '#F6C026', '#2563EB'],   // vermelho · amarelo · azul
    rgb: '37,99,235',
    cat:      { book: '#2563EB', game: '#E0A30F', film: '#E63946' },   // Livros=Azul · Jogos=Amarelo · Filmes=Vermelho
    catLight: { book: '#E7EEFD', game: '#FBF0D0', film: '#FBE0E2' },
  },
  rgb: {
    label: 'RGB',
    accent: '#2563EB', accent2: '#5B8DEF',
    light: '#E7EEFD', lightDark: '#16223F',
    brand: ['#E63946', '#22A852', '#2563EB'],   // vermelho · verde · azul
    rgb: '37,99,235',
    cat:      { book: '#2563EB', game: '#22A852', film: '#E63946' },   // Livros=Azul · Jogos=Verde · Filmes=Vermelho
    catLight: { book: '#E7EEFD', game: '#E2F5E9', film: '#FBE0E2' },
  },
  cyber: {
    label: 'Cyber',
    accent: '#E0459E', accent2: '#00F0FF',
    light: '#FCE3F0', lightDark: '#2E1430',
    brand: ['#00F0FF', '#E0459E', '#7000FF'],   // ciano → magenta → violeta
    rgb: '0,240,255',   // glow ciano (neon)
    cat:      { book: '#08C5D6', game: '#E0459E', film: '#7000FF' },   // Livros=Ciano · Jogos=Magenta · Filmes=Violeta
    catLight: { book: '#DCF6F9', game: '#FCE3F0', film: '#ECE0FF' },
  },
  noir: {
    label: 'Nocturnal',
    accent: '#E0459E', accent2: '#00E5A3',
    light: '#FCE3F0', lightDark: '#1A1B2F',     // tint escuro = azul-noite
    brand: ['#00E5A3', '#E0459E', '#7C6CF5'],   // menta → magenta → violeta
    rgb: '0,229,163',   // glow menta (faz os destaques saltar)
    cat:      { book: '#7C6CF5', game: '#00E5A3', film: '#E0459E' },   // Livros=Violeta · Jogos=Menta · Filmes=Magenta
    catLight: { book: '#EBE8FF', game: '#D5F9EE', film: '#FCE3F0' },
  },
  jewel: {
    label: 'Jewels',
    accent: '#7C3AED', accent2: '#F5B81E',
    light: '#EFE7FD', lightDark: '#241638',
    brand: ['#F5B81E', '#7C3AED', '#14B8A6'],   // ouro → ametista → turquesa
    rgb: '124,58,237',   // glow ametista
    cat:      { book: '#7C3AED', game: '#E0A30F', film: '#14B8A6' },   // Livros=Ametista · Jogos=Ouro · Filmes=Turquesa
    catLight: { book: '#EFE7FD', game: '#FBF0CF', film: '#D7F4F0' },
  },
  pastel: {
    label: 'Pastel',
    accent: '#9B8CF0', accent2: '#FB9D8A',
    light: '#F0ECFD', lightDark: '#26223A',
    brand: ['#54D1B6', '#9B8CF0', '#FB9D8A'],   // menta → lavanda → pêssego
    rgb: '155,140,240',
    cat:      { book: '#9B8CF0', game: '#FB9D8A', film: '#54D1B6' },   // Livros=Lavanda · Jogos=Pêssego · Filmes=Menta
    catLight: { book: '#ECE8FD', game: '#FEEAE4', film: '#DDF6EF' },
  },
}

export const ACCENT_LIST = Object.entries(ACCENTS).map(([id, a]) => ({ id, ...a }))

export function getAccent() {
  const v = localStorage.getItem('accent')
  return ACCENTS[v] ? v : 'purple'
}

// Aplica o tema: recolore tudo (acento, gradientes, glow, categorias) em claro/escuro
export function applyAccent(name) {
  const key = ACCENTS[name] ? name : 'purple'
  const a = ACCENTS[key]
  const root = document.documentElement
  root.dataset.accent = key

  const set = (k, v) => root.style.setProperty(k, v)
  set('--accent', a.accent)
  set('--accent-2', a.accent2)
  const isDark = root.dataset.theme === 'dark'
  set('--purple-light', isDark ? a.lightDark : a.light)
  // Gradiente da marca
  set('--brand-1', a.brand[0])
  set('--brand-2', a.brand[1])
  set('--brand-3', a.brand[2])
  // Glow (suporta alpha fixo e dinâmico)
  set('--accent-rgb', a.rgb)
  set('--accent-glow', `rgba(${a.rgb},0.55)`)
  // Cores de categoria como CSS variables (atualizadas imediatamente, sem remount)
  set('--cat-book', a.cat.book)
  set('--cat-game', a.cat.game)
  set('--cat-film', a.cat.film)
  set('--cat-book-light', a.catLight.book)
  set('--cat-game-light', a.catLight.game)
  set('--cat-film-light', a.catLight.film)
  // Mutação dos objetos JS partilhados (para código que lê CAT_COLOR diretamente)
  Object.assign(CAT_COLOR, a.cat)
  Object.assign(CAT_LIGHT, a.catLight)
}

export function setAccent(name) {
  localStorage.setItem('accent', name)
  applyAccent(name)
  // Re-renderiza a app para os componentes que leem cores em JS (categorias) atualizarem já
  window.dispatchEvent(new CustomEvent('vyllo-accent'))
}
