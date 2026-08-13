import { useTranslation } from 'react-i18next'

const LANGS = [['en', 'EN'], ['ru', 'RU'], ['ka', 'GE']]

export default function LangSwitch({ className = '' }) {
  const { i18n } = useTranslation()
  const cur = (i18n.language || 'en').slice(0, 2)
  const set = (l) => { i18n.changeLanguage(l); localStorage.setItem('bklogic_lang', l) }
  return (
    <div className={`inline-flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 ${className}`}>
      {LANGS.map(([l, lbl]) => (
        <button
          key={l}
          onClick={() => set(l)}
          className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${cur === l ? 'bg-gold-500 text-dark-900' : 'text-gray-400 hover:text-white'}`}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}
