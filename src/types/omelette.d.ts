declare module 'omelette' {
  interface CompletionHandler {
    reply: (suggestions: string[]) => void
  }

  interface Omelette {
    on(event: string, handler: (context: CompletionHandler) => void | Promise<void>): void
    init(): void
    setupShellInitFile(shell: string): string
  }

  function omelette(template: string): Omelette

  export default omelette
}
