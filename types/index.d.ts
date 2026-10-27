export type Rating = 'again' | 'hard' | 'good'

// `suggested` and `why`: the model's grade of a typed answer, when it gave one.
export type Card = { id: string; front: string; typed: string; back?: string; suggested?: Rating; why?: string }

declare module 'claude-code' {
  interface PluginState {
    oliba: { card: Shaped<Card | null> }
  }
}
