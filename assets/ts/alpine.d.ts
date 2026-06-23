declare module 'alpinejs' {
  interface AlpineStatic {
    store(name: string, value?: unknown): unknown;
    start(): void;
  }

  const Alpine: AlpineStatic;
  export default Alpine;
}
