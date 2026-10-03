export async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (root) root.textContent = 'Marisland — scaffold';
}
