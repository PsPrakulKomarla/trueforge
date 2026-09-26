import { z } from 'zod';
import { LocalToolMCP, defineTool, type ToolDefinition } from '@truefoundry/trueforge-core/core/mcp/LocalToolMCP';
import type { AgentTracing } from '@truefoundry/trueforge-core/core/tracing/AgentTracing';
import { toolResultResponse, type CallToolResponse } from '@truefoundry/trueforge-core/core/mcp/IMCPServer';
import type { ApprovalDecision } from '@truefoundry/trueforge-core/core/events/schema';
import type { DevOpsTool, DevOpsToolRegistry, ToolContext } from './devopsTool';

export class ResolveXToolMCP extends LocalToolMCP {
  readonly name = 'resolvex';
  readonly displayName = 'ResolveX DevOps tools';
  constructor(private readonly registry: DevOpsToolRegistry, tracing: AgentTracing) { super({ tracing }); }
  protected getTools(): ToolDefinition[] {
    return this.registry.list().map(tool => defineTool({ name: tool.id, description: tool.description, schema: z.record(z.string(), z.unknown()), handler: (input, decision) => this.execute(tool, input, decision) }));
  }
  private async execute(tool: DevOpsTool, input: Record<string, unknown>, decision?: ApprovalDecision): Promise<CallToolResponse> {
    if (tool.risk !== 'low' && !decision) {
      return { approvalRequired: { tool_info: { type: 'truefoundry-system', mcp_server_id: this.id, mcp_server_name: this.name, original_tool_name: tool.id, is_approval_required: true } } };
    }
    if (decision?.status === 'deny') return toolResultResponse({ text: JSON.stringify({ error: decision.reason ?? 'Tool call denied' }), isError: true });
    const context: ToolContext = { incidentId: String(input.incident_id ?? 'agent-session'), correlationId: String(input.correlation_id ?? 'agent-session'), tenantId: String(input.tenant_id ?? 'default'), signal: new AbortController().signal };
    try { const result = await tool.execute(input, context); return toolResultResponse({ text: JSON.stringify({ summary: result.summary, output: result.output }) }); } catch (error) { return toolResultResponse({ text: JSON.stringify({ error: error instanceof Error ? error.message : 'Tool execution failed' }), isError: true }); }
  }
}

export function createResolveXToolMCP(registry: DevOpsToolRegistry, tracing: AgentTracing): ResolveXToolMCP { return new ResolveXToolMCP(registry, tracing); }
