import React, { useEffect, useState } from 'react';
import { UnitSystem } from '../types/building';
import {
  getUnitSuffix,
  inputToMeters,
  METERS_PER_FOOT,
  METERS_PER_INCH,
  metersToInput,
} from '../engine/units';

interface NumericFieldProps {
  label: string;
  /** Canonical value in meters (for length/section) or degrees (for degrees mode) */
  value: number;
  unit: UnitSystem;
  kind?: 'length' | 'section' | 'degrees';
  min?: number;
  max?: number;
  disabled?: boolean;
  onCommit: (canonicalValue: number) => void;
}

function formatForInput(value: number, unit: UnitSystem, kind: 'length' | 'section' | 'degrees'): string {
  if (!Number.isFinite(value)) return '0';
  if (kind === 'degrees') {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  const num = metersToInput(value, unit, kind);
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
}

function parseInputToCanonical(
  raw: string,
  unit: UnitSystem,
  kind: 'length' | 'section' | 'degrees'
): number | null {
  const s = raw.trim();
  if (!s) return null;

  if (kind === 'degrees') {
    const cleaned = s.replace(/°/g, '').trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  // Support feet-inches notation like 12'6, 12' 6", 12-6
  if (kind === 'length') {
    const ftIn = s.match(/^(-?\d+(?:\.\d+)?)\s*['-]\s*(\d+(?:\.\d+)?)?\s*"?$/);
    if (ftIn) {
      const feet = parseFloat(ftIn[1]);
      const inches = ftIn[2] ? parseFloat(ftIn[2]) : 0;
      if (Number.isFinite(feet) && Number.isFinite(inches)) {
        const sign = feet < 0 ? -1 : 1;
        return sign * (Math.abs(feet) * METERS_PER_FOOT + inches * METERS_PER_INCH);
      }
    }
    const onlyIn = s.match(/^(-?\d+(?:\.\d+)?)\s*"$/);
    if (onlyIn) {
      const inches = parseFloat(onlyIn[1]);
      if (Number.isFinite(inches)) return inches * METERS_PER_INCH;
    }
  }

  const num = Number(s.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(num)) return null;
  return inputToMeters(num, unit, kind);
}

export const NumericField: React.FC<NumericFieldProps> = ({
  label,
  value,
  unit,
  kind = 'length',
  min = -Infinity,
  max = Infinity,
  disabled = false,
  onCommit,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatForInput(value, unit, kind));

  useEffect(() => {
    if (!focused) {
      setDraft(formatForInput(value, unit, kind));
    }
  }, [value, unit, kind, focused]);

  const suffix = kind === 'degrees' ? '°' : getUnitSuffix(unit, kind);

  const commitDraft = () => {
    const parsed = parseInputToCanonical(draft, unit, kind);
    if (parsed === null) {
      setDraft(formatForInput(value, unit, kind));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    const rounded = kind === 'degrees' ? Number(clamped.toFixed(1)) : Number(clamped.toFixed(4));
    if (Math.abs(rounded - value) > 1e-4) {
      onCommit(rounded);
    }
    setDraft(formatForInput(rounded, unit, kind));
  };

  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-500 mb-1">
        {label} ({suffix})
      </span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(formatForInput(value, unit, kind));
            setFocused(false);
            e.currentTarget.blur();
          }
        }}
        className="w-full text-xs font-mono tabular-nums text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:bg-white focus:border-blue-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      />
    </label>
  );
};
