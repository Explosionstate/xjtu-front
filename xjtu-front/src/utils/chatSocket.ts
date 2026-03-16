import { getToken } from "./auth";

type StreamHandlers = {
  onMeta?: (meta: { conversation_id: string; model: string }) => void;
  onThinking?: (payload: {
    status: "start" | "delta" | "done";
    title?: string;
    content?: string;
    kind?: string;
    is_real?: boolean;
    done?: boolean;
  }) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: { sources: Array<{ source_location: string; content: string; score: number }> }) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export class ChatSocket {
  private socket: WebSocket | null = null;

  private handlers: StreamHandlers = {};

  private pendingPayloads: string[] = [];

  connect(handlers: StreamHandlers): void {
    this.handlers = handlers;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = getToken();
    const url = `ws://127.0.0.1:8000/ws/chat/completions?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      for (const payload of this.pendingPayloads) {
        this.socket?.send(payload);
      }
      this.pendingPayloads = [];
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "meta" && this.handlers.onMeta) this.handlers.onMeta(data);
        if (data.type === "thinking" && this.handlers.onThinking) this.handlers.onThinking(data);
        if (data.type === "delta" && this.handlers.onDelta) this.handlers.onDelta(data.content || "");
        if (data.type === "done" && this.handlers.onDone) this.handlers.onDone(data);
        if (data.type === "error" && this.handlers.onError) this.handlers.onError(data.detail || "流式连接错误");
      } catch {
        if (this.handlers.onError) this.handlers.onError("无效的流式数据包");
      }
    };

    this.socket.onerror = () => this.handlers.onError?.("WebSocket 连接失败");
    this.socket.onclose = () => {
      this.handlers.onClose?.();
      this.socket = null;
      this.pendingPayloads = [];
    };
  }

  send(payload: unknown): void {
    if (!this.socket) {
      throw new Error("WebSocket 尚未连接");
    }
    const serialized = JSON.stringify(payload);
    if (this.socket.readyState === WebSocket.CONNECTING) {
      this.pendingPayloads.push(serialized);
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 尚未连接");
    }
    this.socket.send(serialized);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.pendingPayloads = [];
  }
}
