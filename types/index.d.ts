export type Card = { id: string; front: string; typed: string; back?: string }

declare module 'claude-code' {
  interface PluginState {
    oliba: { card: Shaped<Card | null> }
  }
}
