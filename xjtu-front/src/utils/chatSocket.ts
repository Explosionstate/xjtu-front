import { getToken } from "./auth";

type StreamHandlers = {
  onMeta?: (meta: { conversation_id: string; model: string }) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: { sources: Array<{ source_location: string; content: string; score: number }> }) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export class ChatSocket {
  private socket: WebSocket | null = null;

  connect(handlers: StreamHandlers): void {
    const token = getToken();
    const url = `ws://127.0.0.1:8000/ws/chat/completions?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "meta" && handlers.onMeta) handlers.onMeta(data);
        if (data.type === "delta" && handlers.onDelta) handlers.onDelta(data.content || "");
        if (data.type === "done" && handlers.onDone) handlers.onDone(data);
        if (data.type === "error" && handlers.onError) handlers.onError(data.detail || "流式连接错误");
      } catch {
        if (handlers.onError) handlers.onError("无效的流式数据包");
      }
    };

    this.socket.onerror = () => handlers.onError?.("WebSocket 连接失败");
    this.socket.onclose = () => handlers.onClose?.();
  }

  send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 尚未连接");
    }
    this.socket.send(JSON.stringify(payload));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
