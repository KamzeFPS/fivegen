'use client';

import {useSyncExternalStore, type ReactNode} from 'react';
import {ThemeProvider, useTheme} from 'next-themes';
import {Monitor, Moon, Sun} from 'lucide-react';
import {DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem} from '@/components/ui/dropdown-menu';

export type AppearancePreference = 'system' | 'light' | 'dark';
const storageKey = 'fivegen.appearance';
const attributes: ('class' | 'data-appearance')[] = ['class', 'data-appearance'];
const preferences = [
  {value: 'system' as const, label: 'System', icon: Monitor},
  {value: 'light' as const, label: 'Light', icon: Sun},
  {value: 'dark' as const, label: 'Dark', icon: Moon},
];
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** One preference for the public site, docs, account pages and creator workspace. */
export function AppearanceProvider({children}: {children: ReactNode}) {
  return <ThemeProvider attribute={attributes} storageKey={storageKey} defaultTheme="system" enableSystem enableColorScheme disableTransitionOnChange scriptProps={{'data-fivegen-appearance': 'bootstrap'}}>{children}</ThemeProvider>;
}

export function useAppearance() {
  const {theme, resolvedTheme, setTheme} = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const preference: AppearancePreference = mounted && (theme === 'dark' || theme === 'light') ? theme : 'system';
  return {
    preference,
    resolvedAppearance: mounted && resolvedTheme === 'light' ? 'light' as const : 'dark' as const,
    setPreference: (value: AppearancePreference) => setTheme(value),
  };
}

/** Compact native select in headers; segmented buttons in the account menu. */
export function AppearanceControl({variant = 'compact', className = ''}: {variant?: 'compact' | 'segmented'; className?: string}) {
  const {preference, setPreference} = useAppearance();
  if (variant === 'segmented') return <fieldset className={`appearance-control appearance-segmented ${className}`}>
    <legend>Appearance</legend>
    <div>{preferences.map(({value, label, icon: Icon}) => <button key={value} type="button" aria-pressed={preference === value} onClick={() => setPreference(value)}><Icon size={16} aria-hidden="true"/><span>{label}</span></button>)}</div>
  </fieldset>;
  const Icon = preferences.find(option => option.value === preference)!.icon;
  return <label className={`appearance-control appearance-compact ${className}`} title={`Appearance: ${preference}`}>
    <Icon size={17} aria-hidden="true"/>
    <span className="appearance-label">Appearance</span>
    <select aria-label="Appearance" value={preference} onChange={event => setPreference(event.target.value as AppearancePreference)}>
      {preferences.map(({value, label}) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>;
}

/** Radio menu items participate in the account menu's keyboard focus order. */
export function AppearanceMenuItems() {
  const {preference, setPreference} = useAppearance();
  return <div className="appearance-control appearance-menu">
    <DropdownMenuLabel className="appearance-menu-label">Appearance</DropdownMenuLabel>
    <DropdownMenuRadioGroup className="appearance-menu-options" aria-label="Appearance" value={preference} onValueChange={value => {
      if (value === 'system' || value === 'light' || value === 'dark') setPreference(value);
    }}>
      {preferences.map(({value, label, icon: Icon}) => <DropdownMenuRadioItem key={value} className="appearance-menu-option" value={value} textValue={label} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-radio-item"]') || []);
        const position = items.indexOf(event.currentTarget);
        items[(position + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]?.focus();
      }}><Icon size={16} aria-hidden="true"/><span>{label}</span></DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup>
  </div>;
}
