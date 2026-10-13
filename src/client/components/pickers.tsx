import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatWeekdayShort } from '../../shared/dates';
import { PRIORITIES, type Priority, type Weekday } from '../../shared/types';
import { useApp } from '../lib/appContext';
import { ColorDot, Menu, MenuItem } from './controls';
import { PRIORITY_LABELS, PRIORITY_NUMBER } from './TaskRow';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Generic segmented single choice. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; content: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="segmented__option"
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.content}
        </button>
      ))}
    </div>
  );
}

/** "0 Low · 1 Medium · 2 High" */
export function PriorityPicker({
  value,
  onChange,
  disabled,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
  disabled?: boolean;
}) {
  return (
    <Segmented
      label="Priority"
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={PRIORITIES.map((priority) => ({
        value: priority,
        content: (
          <>
            <span className="segmented__number">{PRIORITY_NUMBER[priority]}</span>
            {PRIORITY_LABELS[priority]}
          </>
        ),
      }))}
    />
  );
}

/** List menu with "No list" first. */
export function ListPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (listId: string | null) => void;
  disabled?: boolean;
}) {
  const { lists, listsById } = useApp();
  const list = value ? listsById.get(value) : undefined;
  return (
    <Menu
      label="List"
      disabled={disabled}
      buttonContent={
        <>
          <ColorDot color={list?.color ?? null} />
          {list?.name ?? 'No list'}
          <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) =>
        [null, ...lists].map((option) => (
          <MenuItem
            key={option?.id ?? 'none'}
            selected={value === (option?.id ?? null)}
            onSelect={() => {
              onChange(option?.id ?? null);
              close();
            }}
          >
            <ColorDot color={option?.color ?? null} />
            {option?.name ?? 'No list'}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

/** Mon–Sun toggles; `multiple` lets several days be chosen. */
export function WeekdayPicker({
  value,
  onChange,
  multiple = false,
  disabled,
}: {
  value: Weekday[];
  onChange: (weekdays: Weekday[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const toggle = (day: Weekday) => {
    if (!multiple) return onChange([day]);
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  };
  return (
    <div
      className="segmented weekday-picker"
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={multiple ? 'Weekdays' : 'Weekday'}
    >
      {WEEKDAYS.map((day) => (
        <button
          key={day}
          type="button"
          role={multiple ? 'checkbox' : 'radio'}
          aria-checked={value.includes(day)}
          className="segmented__option"
          onClick={() => toggle(day)}
          disabled={disabled}
        >
          {formatWeekdayShort(day)}
        </button>
      ))}
    </div>
  );
}

/** Days of the month, 1–31, several can be chosen (monthly recurring tasks, SPEC §6.1). */
export function MonthDayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  const toggle = (day: number) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  return (
    <div className="month-day-picker" role="group" aria-label="Days of the month">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
        <button
          key={day}
          type="button"
          role="checkbox"
          aria-checked={value.includes(day)}
          className="month-day-picker__day"
          onClick={() => toggle(day)}
          disabled={disabled}
        >
          {day}
        </button>
      ))}
    </div>
  );
}
