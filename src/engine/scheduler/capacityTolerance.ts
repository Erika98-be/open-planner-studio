// Eén gedeelde tolerantie voor "belasting groter dan capaciteit".
//
// Belasting en capaciteit zijn eenheden per werkdag (1 = één persoon of stuk een volle dag). De
// belasting ontstaat uit deling en optelling van minuten, uren en vormgewichten. Dat geeft ruis in
// de laatste bits: 72 u restwerk over 9 dagen van 8 u boekt 1,0000000000000004 op een dag. Een
// strikte `load > capacity` meldt dan een overbezetting die er niet is.
//
// Keuze van de marge: 1e-9 eenheid per dag.
//  - Ruis: één afrondingsstap is ~2,2e-16 × de waarde. Ook een som van duizenden toewijzingen met
//    capaciteit 1000 blijft ruim onder 1e-9.
//  - Echte overbezetting: de kleinste die telt is 1 minuut per dag. Op een dag van 24 u is dat
//    1/1440 ≈ 6,9e-4 eenheid; op een dag van 8 u 1/480 ≈ 2,1e-3. Dat is ruim zes ordes groter dan
//    de marge, dus die overbezetting telt nog steeds.
//  - De nivelleerder gebruikte al 1e-9 (`EPS` in `ResourceLeveler.ts`). Dezelfde waarde en dezelfde
//    rekenvorm (`load > capacity + marge`) houden zijn uitkomst bit voor bit gelijk.
//
// Gebruik voor elke vergelijking van belasting met capaciteit deze helper, geen eigen getal.

/** Marge in eenheden per werkdag; zie de uitleg bovenaan dit bestand. */
export const CAPACITY_EPS = 1e-9;

/** Waar als `load` de capaciteit echt overschrijdt, dus meer dan alleen rekenruis. */
export function exceedsCapacity(load: number, capacity: number): boolean {
  return load > capacity + CAPACITY_EPS;
}
