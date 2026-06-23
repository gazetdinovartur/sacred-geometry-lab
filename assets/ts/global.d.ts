interface Window {
  labShell: () => { theme: string; toggleTheme: () => void };
  accountPage: () => Record<string, unknown>;
}
