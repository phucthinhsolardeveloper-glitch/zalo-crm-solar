interface StringeeEventTarget {
  on(event: string, handler: (...args: any[]) => void): void;
}

declare class StringeeClient implements StringeeEventTarget {
  on(event: string, handler: (...args: any[]) => void): void;
  connect(accessToken: string): void;
  disconnect(): void;
}

declare class StringeeCall implements StringeeEventTarget {
  constructor(client: StringeeClient, from: string, to: string, isVideoCall: boolean);
  fromNumber?: string;
  toNumber?: string;
  callId?: string;
  id?: string;
  on(event: string, handler: (...args: any[]) => void): void;
  makeCall(callback: (result: any) => void): void;
  answer(callback: (result: any) => void): void;
  reject(callback: (result: any) => void): void;
  hangup(callback: (result: any) => void): void;
  mute(muted: boolean): void;
}

interface Window {
  StringeeClient?: typeof StringeeClient;
  StringeeCall?: typeof StringeeCall;
}
