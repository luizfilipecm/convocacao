import { SKILLS, SKILL_LABELS, type Skills } from '../lib/types'

export const defaultSkills = (v = 5): Skills =>
  Object.fromEntries(SKILLS.map(s => [s, v])) as Skills

export default function SkillEditor({
  skills, onChange, disabled,
}: {
  skills: Skills
  onChange: (s: Skills) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {SKILLS.map(key => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-sm text-zinc-600">{SKILL_LABELS[key]}</span>
          <input
            type="range" min={1} max={10} step={1}
            className="flex-1 accent-emerald-600"
            value={skills[key]}
            disabled={disabled}
            onChange={e => onChange({ ...skills, [key]: Number(e.target.value) })}
          />
          <span className="w-6 text-right text-sm font-bold">{skills[key]}</span>
        </div>
      ))}
    </div>
  )
}
