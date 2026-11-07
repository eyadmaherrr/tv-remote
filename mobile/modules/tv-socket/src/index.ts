import { NativeModule, requireNativeModule } from "expo";

type TvSocketEvents = {
  onOpen(event: Record<string, never>): void;
  onMessage(event: { data: string }): void;
  onClose(event: { code: number; reason: string }): void;
  onError(event: { message: string }): void;
};

declare class TvSocketModule extends NativeModule<TvSocketEvents> {
  /** Opens wss://… to the TV, trusting only its SmartViewSDK certificate at `host`. */
  connect(url: string, host: string): Promise<void>;
  send(text: string): boolean | void;
  close(): void;
  /** One HTTPS request to the TV (e.g. launching an app), with the same trust rule. */
  request(method: string, url: string, host: string): Promise<{ status: number; body: string }>;
}

export const TvSocket = requireNativeModule<TvSocketModule>("TvSocket");
