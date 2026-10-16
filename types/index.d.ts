// The values Katharsis keeps in the session's state, which outlives a reload
// of the plugin's code. A change in the drawer's settings view reloads it.
export type KatharsisView = 'short' | 'full' | 'current' | 'settings';
export type KatharsisShow = 'all' | 'open' | 'resolved';

declare module 'claude-code' {
  interface PluginState {
    katharsis: {
      // The drawer's view, so an open drawer comes back on the same one.
      view: KatharsisView;
      // The last finished reply's text, which tells the latest reply block apart.
      lastAnswer: string;
      // The drawer's Status, a standing preference.
      show: KatharsisShow;
    };
  }
}
