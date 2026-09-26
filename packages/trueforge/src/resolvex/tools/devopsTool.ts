/**
 * DevOps tool contract and registry.
 *
 * Mirrors TrueForge's `defineTool` (`core/mcp/LocalToolMCP.ts`): a Zod input schema
 * plus a handler, with raw arguments validated at the boundary — but adds the
 * ResolveX surface the engine needs: category, declared risk, required permissions
 * and an optional rollback.
 *
 * Tools are registered, never hard-coded into an engine, so a new integration is a
 * new registration rather than a branch. Tools with no backing integration are
 * simply absent: callers get an explicit "unavailable", never a stub that pretends.
 */
import { z } from 'zod';
import type { RiskLevel } from '../domain/risk';

export type ToolCategory = 'diagnostics' | 'remediation' | 'verification';

/** Everything a tool needs to be attributable and cancellable. */
export interface ToolContext {
  incidentId: string;
  correlationId: string;
  tenantId: string;
  userId?: string;
  signal: AbortSignal;
}

export interface ToolResult {
  /** Machine-readable outcome; persisted into the audit event. */
  output: Record<string, unknown>;
  /** One-line human summary shown in the timeline. */
  summary: string;
}

export interface ToolValidation {
  ok: boolean;
  reason?: string;
}

/** Raw tool arguments failed the tool's own schema. */
export class ToolInputValidationError extends Error {
  readonly toolId: string;

  constructor(toolId: string, issues: string) {
    super(`Invalid input for tool ${toolId}: ${issues}`);
    this.name = 'ToolInputValidationError';
    this.toolId = toolId;
  }
}

export interface DevOpsTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  risk: RiskLevel;
  requiredPermissions: string[];
  /** JSON Schema of the input, advertised to the planner and the UI. */
  inputSchema: Record<string, unknown>;
  /** Original schema used to validate arguments at the MCP boundary. */
  schema: z.ZodType;
  execute: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Pre-flight check (target exists, integration reachable). Defaults to ok. */
  validate?: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolValidation>;
  /** Undo where the target system supports it. Absent = not reversible. */
  rollback?: (rawArgs: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Declares one tool. Validates `rawArgs` before the handler runs, so an engine can
 * pass model-produced arguments straight through and still fail closed.
 */
export function defineDevOpsTool<TArgs>(config: {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  risk: RiskLevel;
  requiredPermissions?: readonly string[];
  schema: z.ZodType<TArgs>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
  validate?: (args: TArgs, ctx: ToolContext) => Promise<ToolValidation>;
  rollback?: (args: TArgs, ctx: ToolContext) => Promise<ToolResult>;
}): DevOpsTool {
  const parse = (rawArgs: unknown): TArgs => {
    const parsed = config.schema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolInputValidationError(config.id, z.prettifyError(parsed.error));
    }
    return parsed.data;
  };

  const tool: DevOpsTool = {
    id: config.id,
    name: config.name,
    description: config.description,
    category: config.category,
    risk: config.risk,
    requiredPermissions: [...(config.requiredPermissions ?? [])],
    inputSchema: config.schema.toJSONSchema({ io: 'input' }),
    schema: config.schema,
    execute: (rawArgs, ctx) => config.execute(parse(rawArgs), ctx),
  };
  if (config.validate !== undefined) {
    const validate = config.validate;
    tool.validate = (rawArgs, ctx) => validate(parse(rawArgs), ctx);
  }
  if (config.rollback !== undefined) {
    const rollback = config.rollback;
    tool.rollback = (rawArgs, ctx) => rollback(parse(rawArgs), ctx);
  }
  return tool;
}

export interface DevOpsToolRegistry {
  register(tool: DevOpsTool): void;
  get(id: string): DevOpsTool | undefined;
  list(): DevOpsTool[];
}

export function createDevOpsToolRegistry(): DevOpsToolRegistry {
  const tools = new Map<string, DevOpsTool>();
  return {
    register(tool) {
      const existing = tools.get(tool.id);
      if (existing !== undefined) {
        throw new Error(`Duplicate ResolveX tool id "${tool.id}" (already registered by ${existing.name})`);
      }
      tools.set(tool.id, tool);
    },
    get: id => tools.get(id),
    list: () => [...tools.values()],
  };
}
