/**
 * Token counts for budgeting using gpt-tokenizer (GPT-4o / o200k family).
 * Provider APIs may bill slightly differently; non-OpenAI providers are labeled as estimates.
 */

import { encodeChat, countTokens } from "gpt-tokenizer/model/gpt-4o-mini";

/**
 * @param {string} system
 * @param {{ role: string, content: string }[]} messages
 */
export function countPromptTokens(system, messages) {
  const chat = [{ role: "system", content: system }, ...messages];
  return encodeChat(chat).length;
}

/**
 * @param {string} text
 */
export function countCompletionTokens(text) {
  if (!text || typeof text !== "string") return 0;
  return countTokens(text);
}

/**
 * @param {{ provider: string, model: string, system: string, messages: { role: string, content: string }[], completionText: string }} p
 */
export function computeChatTokenUsage(p) {
  const { provider, model, system, messages, completionText } = p;
  try {
    const promptTokens = countPromptTokens(system, messages);
    const completionTokens = countCompletionTokens(completionText);
    const totalTokens = promptTokens + completionTokens;
    const isOpenAiBillingShape = provider === "openai";
    return {
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      encoder: "gpt-tokenizer:gpt-4o-mini (o200k_base)",
      estimate:
        !isOpenAiBillingShape
          ? "Non-OpenAI providers use different tokenizers for billing; counts are GPT-style for comparison."
          : model && !/^gpt-4o(-mini)?/i.test(model)
            ? "Model differs from gpt-4o-mini tokenizer baseline; treat as close estimate."
            : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      provider,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      encoder: "unavailable",
      estimate: `Token estimate skipped (${msg.slice(0, 120)})`,
    };
  }
}

/**
 * App Spec JSON size in the same token space (useful for preview/codegen payload size).
 * @param {unknown} spec
 */
export function computeSpecJsonTokenUsage(spec) {
  const raw = JSON.stringify(spec ?? {});
  const specJsonTokens = countTokens(raw);
  return {
    specJsonTokens,
    encoder: "gpt-tokenizer:gpt-4o-mini",
    note: "Spec JSON token count (no LLM call for preview build).",
  };
}
