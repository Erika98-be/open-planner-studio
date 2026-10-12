/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** Per-worktree dev instance slug, or '' in a plain build (see vite.config.ts). */
declare const __OPS_DEV_INSTANCE__: string;

interface ImportMetaEnv {
  /** '1' in de platformbouw (`vite build --mode platform`, zie `.env.platform`); anders afwezig.
   *  Lees hem nooit direct: gebruik de constanten uit `src/utils/buildFlags.ts`. */
  readonly VITE_OPS_PLATFORM?: string;
}
