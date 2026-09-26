/**
 * Risk classification for every ResolveX action.
 *
 * Risk is a property of the *action*, declared once by its tool; policies decide
 * what a given risk implies (approval, blast radius, retries). Keeping the scale
 * here means the API, the executor and the UI all read one definition.
 */
import { z } from '@hono/zod-openapi';

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']).openapi('RiskLevel');

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Operational class of a risk level:
 * - `read_only`         never mutates the target system
 * - `approval_required` mutates, but reversibly and within one service
 * - `destructive`       irreversible or broad blast radius
 */
export const RiskCategorySchema = z.enum(['read_only', 'approval_required', 'destructive']).openapi('RiskCategory');

export type RiskCategory = z.infer<typeof RiskCategorySchema>;

const CATEGORY_BY_RISK: Record<RiskLevel, RiskCategory> = {
  low: 'read_only',
  medium: 'approval_required',
  high: 'approval_required',
  critical: 'destructive',
};

export function riskCategory(risk: RiskLevel): RiskCategory {
  return CATEGORY_BY_RISK[risk];
}

/** Sort key so plans can report their peak risk without re-deriving order. */
const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function maxRisk(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((worst, level) => (RISK_ORDER[level] > RISK_ORDER[worst] ? level : worst), 'low');
}
