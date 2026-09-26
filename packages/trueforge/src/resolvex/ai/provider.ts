/**
 * ResolveX's AI port.
 *
 * Deliberately provider-agnostic: nothing in ResolveX may name Gemini, OpenAI or
 * any other vendor. The production adapter wraps TrueForge's own `ILLM`
 * (`trueforge-core/src/core/llm/ILLM.ts`) — `VercelAILLM`, constructed from the
 * tenant's configured model provider via `getModelDetails()` — so switching models
 * is a settings change, not a code change. `stream()` is declared now so the
 * contract does not have to widen when streamed investigation lands.
 */
import type { z } from 'zod';

export interface AIGenerateRequest {
  system: string;
  user: string;
  /** Caps output tokens when the provider supports it. */
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AITextResult {
  text: string;
  /** Provider-agnostic model identity, recorded on the diagnosis. */
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AIStreamEvent {
  type: 'text_delta' | 'done';
  text?: string;
}

export interface AIStructuredRequest<T> {
  system: string;
  user: string;
  /** Response shape enforced at the boundary; a parse failure rejects the call. */
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  /** Stable identifier for logs/audit (`gemini`, `openai`, `local`, …). */
  readonly name: string;
  generate(request: AIGenerateRequest): Promise<AITextResult>;
  stream(request: AIGenerateRequest): AsyncGenerator<AIStreamEvent, void, unknown>;
  structuredOutput<T>(request: AIStructuredRequest<T>): Promise<T>;
}
