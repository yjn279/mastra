import type { ClientConfig } from './types';
import { aurora } from './aurora';
import { lumen } from './lumen';
import { verde } from './verde';

const registry: Record<string, ClientConfig> = {
  [aurora.id]: aurora,
  [lumen.id]: lumen,
  [verde.id]: verde,
};

/** Resolve a client config by id, throwing if unknown. */
export function getClient(id: string): ClientConfig {
  const client = registry[id];
  if (!client) {
    throw new Error(`unknown client "${id}". known clients: ${Object.keys(registry).join(', ')}`);
  }
  return client;
}

export function listClients(): ClientConfig[] {
  return Object.values(registry);
}

export type { ClientConfig } from './types';
