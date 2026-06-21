declare module '*.css' {
  const content: string;
  export default content;
}

interface PluginApi {
  registerActionHandler(type: string, handler: (params: Record<string, any>, context: any) => any): void;
  unregisterActionHandler(type: string): void;
  emit(event: string, payload?: any): void;
  on(event: string, handler: (payload: any) => void): () => void;
  toast(message: string): void;
  getSettings(): Record<string, any>;
}

interface Window {
  /** OrdPaw 内部全局命名空间，避免污染 window 顶层。 */
  __ordpaw?: {
    ws?: WebSocket;
    version: string;
    OrdPaw?: PluginApi;
  };
  /** 兼容旧插件脚本的公开 API 别名。 */
  OrdPaw?: PluginApi;
}