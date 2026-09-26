import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  LocalToolMCP,
  NOOP_AGENT_TRACING,
  defineTool,
  toolResultResponse,
  type AgentTracing,
  type ToolDefinition,
} from '@truefoundry/trueforge-core/core';
import type { ResolvexSettings } from '../config';
import { approvalRequirement } from '../policies/approvalPolicy';
import { ToolInputValidationError, type DevOpsToolRegistry, type ToolContext } from './devopsTool';

export class ResolvexToolMCP extends LocalToolMCP {
  readonly name = 'resolvex';
  readonly displayName = 'ResolveX DevOps tools';

  constructor(
    private readonly options: {
      registry: DevOpsToolRegistry;
      settings: ResolvexSettings;
      context: () => ToolContext;
      tracing?: AgentTracing | undefined;
    },
  ) {
    super({ tracing: options.tracing ?? NOOP_AGENT_TRACING });
  }

  protected override getTools(): ToolDefinition[] {
    return this.options.registry.list().map(tool =>
      defineTool({
        name: tool.id,
        description: `${tool.description} Risk: ${tool.risk}.`,
        schema: tool.schema,
        handler: async (args, decision) => {
          if (decision?.status === 'deny') {
            return toolResultResponse({ text: JSON.stringify({ error: 'User denied tool call' }), isError: true });
          }
          if (approvalRequirement(tool.risk, this.options.settings) === 'explicit' && decision?.status !== 'allow') {
            return {
              approvalRequired: {
                tool_info: await this.toolCallInfo({ name: tool.id }),
              },
            };
          }
          try {
            const result = await tool.execute(args, this.options.context());
            return toolResultResponse({ text: JSON.stringify({ output: result.output, summary: result.summary }) });
          } catch (error) {
            const message = error instanceof ToolInputValidationError ? error.message : 'Tool execution failed';
            return toolResultResponse({ text: JSON.stringify({ error: message }), isError: true });
          }
        },
      }),
    );
  }

  override async toolCallInfo(
    params: CallToolRequest['params'],
    resolveUnderlyingTool?: boolean,
  ): Promise<Awaited<ReturnType<LocalToolMCP['toolCallInfo']>>> {
    const info = await super.toolCallInfo(params, resolveUnderlyingTool);
    const tool = this.options.registry.get(params.name);
    return {
      ...info,
      is_approval_required: tool !== undefined && approvalRequirement(tool.risk, this.options.settings) === 'explicit',
    };
  }
}

export function createResolvexToolMCP(options: ConstructorParameters<typeof ResolvexToolMCP>[0]): ResolvexToolMCP {
  return new ResolvexToolMCP(options);
}
