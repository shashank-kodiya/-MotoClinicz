import { useEffect, useMemo, useRef, useState } from 'react';
import { localDate } from '../utils/booking.js';

// Our own date picker (the browser's calendar pop-up can't be styled): a rounded card with month and
// year dropdowns, quick-pick chips, an optional Clear button and keyboard support. Works with 'YYYY-MM-DD'.
//   quick:     [[label, 'YYYY-MM-DD'], ...] shortcuts (default: Today, Tomorrow)
//   clearable: show "Clear" (for optional dates); onChange('') clears
//   minYear / maxYear: range of the year dropdown (default: min/max, or 30 years back to 20 ahead)
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (s) => new Date(`${s}T00:00:00`);
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return toStr(d); };
export const addMonths = (s, n) => { const d = toDate(s); d.setMonth(d.getMonth() + n); return toStr(d); };
const pretty = (s) => toDate(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function DatePicker({ value, onChange, min, max, label = 'Date', placeholder = 'Choose a date', quick, clearable = false, minYear, maxYear }) {
  const today = localDate();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [view, setView] = useState(() => (value || today).slice(0, 7)); // 'YYYY-MM' shown
  const [focus, setFocus] = useState(value || today);
  const box = useRef(null);
  const grid = useRef(null);

  const allowed = (s) => (!min || s >= min) && (!max || s <= max);

  // The 6 weeks shown for the current month (starting on Sunday).
  const days = useMemo(() => {
    const first = toDate(`${view}-01`);
    const start = addDays(toStr(first), -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view]);

  const [vy, vm] = view.split('-').map(Number);
  const lastOfView = toStr(new Date(vy, vm, 0));
  const canPrev = !min || `${view}-01` > min;
  const canNext = !max || lastOfView < max;
  const shiftMonth = (n) => setView(addMonths(`${view}-01`, n).slice(0, 7));

  // Years in the year dropdown: limited by min/max, otherwise 30 years back and 20 ahead.
  const thisYear = Number(today.slice(0, 4));
  const fromYear = minYear ?? (min ? Number(min.slice(0, 4)) : thisYear - 30);
  const toYear = maxYear ?? (max ? Number(max.slice(0, 4)) : thisYear + 20);
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);

  const pick = (s) => {
    if (!allowed(s)) return;
    onChange(s);
    setOpen(false);
  };

  // Open on the selected month (to the left if there is no room on the right); close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    setView((value || today).slice(0, 7));
    setFocus(value || today);
    const r = box.current?.getBoundingClientRect();
    setAlignRight(!!r && r.left + 320 > window.innerWidth);
    const onDoc = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep keyboard focus on the focused day.
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
  }, [open, focus, view]);

  const onKey = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key] != null) {
      e.preventDefault();
      const next = addDays(focus, moves[e.key]);
      setFocus(next);
      if (next.slice(0, 7) !== view) setView(next.slice(0, 7));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      shiftMonth(e.key === 'PageUp' ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focus);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const shortcuts = (quick || [['Today', today], ['Tomorrow', addDays(today, 1)]]).filter(([, s]) => allowed(s));

  return (
    <div className="datepicker" ref={box} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className={`datepicker__field ${open ? 'open' : ''} ${value ? '' : 'empty'}`} onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${value ? pretty(value) : 'not set'}`}>
        <span>{value ? pretty(value) : placeholder}</span>
        <span className="datepicker__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V10h14v10ZM7 12h5v5H7v-5Z" /></svg>
        </span>
      </button>

      {open && (
        <div className={`datepicker__pop ${alignRight ? 'right' : ''}`} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
          <div className="datepicker__head">
            <button type="button" className="datepicker__nav" onClick={() => shiftMonth(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
            <div className="datepicker__jump">
              <select value={vm} onChange={(e) => setView(`${vy}-${pad(e.target.value)}`)} aria-label="Month">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={vy} onChange={(e) => setView(`${e.target.value}-${pad(vm)}`)} aria-label="Year">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" className="datepicker__nav" onClick={() => shiftMonth(1)} disabled={!canNext} aria-label="Next month">›</button>
          </div>
          <div className="datepicker__week" aria-hidden="true">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="datepicker__grid" role="grid" ref={grid} onKeyDown={onKey}>
            {days.map((s) => {
              const ok = allowed(s);
              const cls = [
                'datepicker__day',
                s.slice(0, 7) !== view && 'other',
                s === today && 'today',
                s === value && 'selected',
                !ok && 'disabled'
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={s} type="button" role="gridcell" className={cls} data-day={s}
                  tabIndex={s === focus ? 0 : -1} disabled={!ok} aria-selected={s === value}
                  aria-label={`${pretty(s)}${s === today ? ', today' : ''}${!ok ? ', not available' : ''}`}
                  onClick={() => pick(s)}
                >
                  {Number(s.slice(8))}
                </button>
              );
            })}
          </div>
          {(shortcuts.length > 0 || clearable || max) && (
            <div className="datepicker__foot">
              {shortcuts.map(([t, s]) => <button key={t} type="button" className={`datepicker__chip ${s === value ? 'on' : ''}`} onClick={() => pick(s)}>{t}</button>)}
              {clearable && value && <button type="button" className="datepicker__chip clear" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>}
              {max && <span className="datepicker__hint">Up to {pretty(max).replace(/^\w+, /, '')}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
