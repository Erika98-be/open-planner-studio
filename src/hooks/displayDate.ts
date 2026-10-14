import { useMemo } from 'react';
import { useAppStore } from '@/state/appStore';
import type { DateNotation, TimeNotation } from '@/types/view';
import { displayDate, displayDateTime } from '@/utils/displayDate';

/**
 * React-hooks rond de datum-weergaveformatters. Deze leven in `src/hooks/` (niet in
 * `src/utils/`) omdat ze op de Zustand-store subscriben; de pure formatters zelf blijven in
 * `@/utils/displayDate`.
 */

/** Reactieve toegang tot de huidige notatie-instelling (hertekent bij wijziging). */
export function useDateNotation(): DateNotation {
  return useAppStore(s => s.ui.dateNotation);
}

/** Reactieve toegang tot de instelling Tijdnotatie (24 of 12 uur; hertekent bij wijziging). */
export function useTimeNotation(): TimeNotation {
  return useAppStore(s => s.ui.timeNotation);
}

/**
 * Reactieve formatters gebonden aan de huidige instelling. Componenten lezen zo de notatie via
 * de store-hook (niet via een module-constante), zodat ze live hertekenen bij een wijziging.
 */
export function useDisplayDate(): {
  date: (iso: string | undefined) => string;
  dateTime: (iso: string | undefined) => string;
} {
  const notation = useDateNotation();
  const timeNotation = useTimeNotation();
  return useMemo(() => ({
    date: (iso: string | undefined) => displayDate(iso, notation),
    dateTime: (iso: string | undefined) => displayDateTime(iso, notation, timeNotation),
  }), [notation, timeNotation]);
}
