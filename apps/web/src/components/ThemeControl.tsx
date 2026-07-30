import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../types';

export function ThemeControl({ value, onChange }: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'dark', label: 'Dark', icon: Moon }
  ];
  return (
    <div className="theme-control" role="group" aria-label="Color theme">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            className={value === option.value ? 'is-active' : ''}
            type="button"
            title={option.label}
            aria-label={`${option.label} theme`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <Icon size={14} strokeWidth={1.7}/>
          </button>
        );
      })}
    </div>
  );
}
