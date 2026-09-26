/**
 * ResolveX route paths. The command center lives under `/resolvex` so it coexists
 * with the TrueForge chat shell, which owns its own `BrowserRouter` — two routers
 * would fight over history, so ResolveX gets a sibling app instead of injected routes.
 * The server needs no change: `mountFrontend`'s SPA fallback already serves any deep link.
 */
import { UI_BASE_PATH } from '../publicPath';

export const RESOLVEX_SEGMENT = 'resolvex';

/** Absolute prefix the app is served under (`/resolvex` or `<base>/resolvex`). */
export function resolvexPathPrefix(): string {
  return UI_BASE_PATH === '/' ? `/${RESOLVEX_SEGMENT}` : `${UI_BASE_PATH.replace(/\/$/, '')}/${RESOLVEX_SEGMENT}`;
}

/** React Router basename for the ResolveX app (no trailing slash). */
export function resolvexBasename(routerBasename: string | undefined): string {
  return routerBasename === undefined ? `/${RESOLVEX_SEGMENT}` : `${routerBasename}/${RESOLVEX_SEGMENT}`;
}

/** True when the current location belongs to ResolveX, not the chat shell. */
export function isResolvexPath(pathname: string = window.location.pathname): boolean {
  const prefix = resolvexPathPrefix();
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
