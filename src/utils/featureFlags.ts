import type { ParseKeys } from 'i18next';

export interface FeatureFlag {
  id: string;
  nameKey: ParseKeys<'common'>;
  descriptionKey?: ParseKeys<'common'>;
  /** Nieuwe IFC-data: geen checkbox zolang de opslag daarvan nog niet af is. */
  writesNewIfcData: boolean;
}

/** Voeg hier tijdelijke functies toe. Geen voorbeeldflags in de uitgeleverde app. */
export const FEATURE_FLAGS: FeatureFlag[] = [];

export type FeatureFlagValues = Record<string, boolean>;

/** Onbekende ids en functies met nog nieuwe IFC-data blijven altijd uit. */
export function isFeatureEnabled(values: Readonly<FeatureFlagValues>, id: string): boolean {
  return FEATURE_FLAGS.some(flag => flag.id === id && !flag.writesNewIfcData)
    && Object.prototype.hasOwnProperty.call(values, id) && values[id] === true;
}

/** Alleen booleans overnemen. Bewaarde ids zonder register-entry zijn inert. */
export function parseFeatureFlagValues(raw: unknown): FeatureFlagValues | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'boolean'));
}
