/**
 * Friendli.ai Service — DEPRECATED
 *
 * This module has been replaced by HuggingFace Inference API (Pro plan).
 * All models (PleIAs, BLOOMZ) now go through the HF Inference API via the Cloudflare Worker proxy.
 *
 * This file is kept as a stub for any remaining imports. It can be safely deleted
 * once all references are confirmed removed.
 */

// Legacy exports — these are no-ops now
export const FRIENDLI_MODELS = {};

export function isFriendliConfigured() {
  return false;
}

export async function isFriendliAvailable() {
  return false;
}

export async function checkServerFriendli() {
  return { configured: false, models: [] };
}

export async function warmupFriendliEndpoint() {
  return { success: true, status: 'not_needed', message: 'Using HuggingFace Inference API' };
}

export function isFriendliModel() {
  return false;
}

export async function chatWithFriendli() {
  throw new Error('Friendli.ai has been replaced by HuggingFace Inference API');
}
