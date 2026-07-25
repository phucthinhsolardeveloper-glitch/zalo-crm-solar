import { computed, ref } from 'vue';
import { api } from '@/api';

declare global {
  interface Window {
    OMICallSDK?: {
      init: (config: Record<string, unknown>) => Promise<boolean>;
      register: (config: { sipRealm: string; sipUser: string; sipPassword: string }) => Promise<{ status: string }>;
      unregister: () => void;
      makeCall: (remoteNumber: string, options?: { isVideo?: boolean }) => void;
      on: (event: string, cb: (data: any) => void) => void;
      off: (event: string, cb: (data: any) => void) => void;
    };
  }
}

export type PhonePhase = 'disabled' | 'connecting' | 'ready' | 'calling' | 'ringing' | 'answered' | 'ended' | 'error';
export interface PhonePeer {
  id: string; fullName: string; avatarUrl?: string | null; role: string; omicallExtension: string;
  kind?: 'internal' | 'external'; phoneNumber?: string;
}
export interface CallHistoryItem {
  id: string; direction: 'inbound' | 'outbound'; status: string; startedAt: string;
  durationSec?: number | null; endReason?: string | null; externalNumber?: string | null;
  peerUser?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  contact?: { id: string; fullName?: string | null; crmName?: string | null; avatarUrl?: string | null; phone?: string | null } | null;
}

interface OmicallCallData {
  transaction_id?: string;
  transactionId?: string;
  call_uuid?: string;
  callId?: string;
  id?: string;
  direction?: string;
  isOutbound?: boolean;
  remoteNumber?: string;
  remoteStream?: MediaStream;
  reason?: string;
  sipReason?: string;
  accept?: () => void;
  decline?: () => void;
  end?: () => void;
  mute?: (muted: boolean) => void;
}

const SDK_URL = 'https://cdn.omicrm.com/sdk/web/3.0.41/core.min.js';
const phase = ref<PhonePhase>('connecting');
const errorMessage = ref('');
const peers = ref<PhonePeer[]>([]);
const history = ref<CallHistoryItem[]>([]);
const activePeer = ref<PhonePeer | null>(null);
const incoming = ref(false);
const muted = ref(false);
const elapsedSec = ref(0);
const enabled = ref(true);
const fromNumber = ref<string | null>(null);
let activeCall: OmicallCallData | null = null;
let localCallId: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let initialized: Promise<void> | null = null;
let terminalHandled = false;

function loadSdk(): Promise<void> {
  if (window.OMICallSDK) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error('Không tải được Omicall Web SDK')), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Omicall Web SDK'));
    document.head.appendChild(script);
  });
}

function providerCallId(call?: OmicallCallData): string | undefined {
  return call?.transaction_id || call?.transactionId || call?.call_uuid || call?.callId || call?.id;
}

function normalizeVnPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `84${digits.slice(1)}`;
  if (!digits.startsWith('84') || digits.length < 11 || digits.length > 12) return null;
  return digits;
}

async function refreshHistory() {
  try {
    const { data } = await api.get<{ calls: CallHistoryItem[] }>('/telephony/calls', { params: { limit: 20 } });
    history.value = data.calls;
  } catch { /* softphone remains usable if history fails */ }
}

async function patchLog(status: string, extra: Record<string, unknown> = {}) {
  if (!localCallId) return;
  try { await api.patch(`/telephony/calls/${localCallId}`, { status, ...extra }); } catch { /* best effort */ }
}

function startTimer() {
  if (timer) clearInterval(timer);
  elapsedSec.value = 0;
  timer = setInterval(() => { elapsedSec.value += 1; }, 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function finish(status: 'completed' | 'rejected' | 'missed' | 'failed', reason?: string) {
  if (terminalHandled) return;
  terminalHandled = true;
  stopTimer();
  await patchLog(status, { durationSec: elapsedSec.value, endReason: reason || undefined });
  phase.value = 'ended';
  activeCall = null;
  incoming.value = false;
  muted.value = false;
  void refreshHistory();
}

async function createLog(target: PhonePeer | string, direction: 'inbound' | 'outbound', call?: OmicallCallData) {
  const { data } = await api.post('/telephony/calls', {
    ...(typeof target === 'string' ? { phoneNumber: target } : { peerUserId: target.id }),
    direction,
    providerCallId: providerCallId(call),
  });
  localCallId = data.id;
}

async function handleIncoming(callData: OmicallCallData) {
  if (activeCall) { callData.decline?.(); return; }
  const remoteNumber = String(callData.remoteNumber || '');
  const peer = peers.value.find((item) => item.omicallExtension === remoteNumber);
  const phoneNumber = peer ? null : normalizeVnPhone(remoteNumber);
  if (!peer && !phoneNumber) { callData.decline?.(); return; }
  activeCall = callData;
  activePeer.value = peer || {
    id: phoneNumber!,
    fullName: phoneNumber!,
    role: 'contact',
    omicallExtension: remoteNumber,
    kind: 'external',
    phoneNumber: phoneNumber!,
  };
  incoming.value = true;
  terminalHandled = false;
  elapsedSec.value = 0;
  phase.value = 'ringing';
  try { await createLog(peer || phoneNumber!, 'inbound', callData); } catch { /* call can still be answered */ }
}

const registerHandler = (data: any) => {
  if (data?.status === 'connected') {
    phase.value = 'ready';
  } else if (data?.status === 'connecting') {
    phase.value = 'connecting';
  } else {
    phase.value = 'error';
    errorMessage.value = data?.message || 'Omicall từ chối đăng nhập';
  }
};

const ringingHandler = (callData: OmicallCallData) => {
  const isInbound = callData.direction === 'inbound' || callData.isOutbound === false;
  if (isInbound && !activeCall) {
    void handleIncoming(callData);
    return;
  }
  activeCall = callData;
  phase.value = 'ringing';
  const id = providerCallId(callData);
  void patchLog('ringing', id ? { providerCallId: id } : {});
  if (callData.remoteStream) {
    const audio = document.getElementById('omicall-remote-audio') as HTMLAudioElement | null;
    if (audio) {
      audio.srcObject = callData.remoteStream;
      void audio.play().catch(() => undefined);
    }
  }
};

const acceptedHandler = (callData: OmicallCallData) => {
  activeCall = callData;
  phase.value = 'answered';
  incoming.value = false;
  startTimer();
  const id = providerCallId(callData);
  void patchLog('answered', id ? { providerCallId: id } : {});
};

const endedHandler = (callData: OmicallCallData) => {
  const reason = String(callData?.reason || callData?.sipReason || '');
  const fallback = phase.value === 'answered' ? 'completed' : (incoming.value ? 'missed' : 'rejected');
  void finish(fallback, reason);
};

function bindSdkEvents() {
  const sdk = window.OMICallSDK;
  if (!sdk) return;
  sdk.off('register', registerHandler);
  sdk.off('ringing', ringingHandler);
  sdk.off('accepted', acceptedHandler);
  sdk.off('ended', endedHandler);
  sdk.on('register', registerHandler);
  sdk.on('ringing', ringingHandler);
  sdk.on('accepted', acceptedHandler);
  sdk.on('ended', endedHandler);
}

async function connect() {
  phase.value = 'connecting';
  errorMessage.value = '';
  try {
    const [{ data }] = await Promise.all([
      api.get('/telephony/omicall/connect-config'),
      loadSdk(),
    ]);
    enabled.value = Boolean(data.enabled);
    peers.value = data.peers;
    fromNumber.value = data.hotline || null;
    if (!window.OMICallSDK) throw new Error('Omicall SDK chưa sẵn sàng');
    window.OMICallSDK.unregister();
    bindSdkEvents();
    await window.OMICallSDK.init({});
    const result = await window.OMICallSDK.register({
      sipRealm: data.sipRealm,
      sipUser: data.sipUser,
      sipPassword: data.sipPassword,
    });
    phase.value = result?.status === 'connected' ? 'ready' : result?.status === 'connecting' ? 'connecting' : 'error';
    if (phase.value === 'error') errorMessage.value = 'Omicall từ chối đăng nhập';
    void refreshHistory();
  } catch (error: any) {
    if (error?.response?.status === 503) enabled.value = false;
    phase.value = enabled.value ? 'error' : 'disabled';
    errorMessage.value = error?.response?.data?.error || error?.message || 'Không kết nối được tổng đài';
  }
}

function initialize(force = false): Promise<void> {
  if (force) initialized = null;
  if (!initialized) initialized = connect();
  return initialized;
}

async function startOutgoing(target: PhonePeer | string, remoteNumber: string) {
  if (!window.OMICallSDK || phase.value !== 'ready') return;
  activePeer.value = typeof target === 'string'
    ? { id: remoteNumber, fullName: remoteNumber, role: 'contact', omicallExtension: remoteNumber, kind: 'external', phoneNumber: remoteNumber }
    : { ...target, kind: 'internal' };
  incoming.value = false;
  terminalHandled = false;
  elapsedSec.value = 0;
  phase.value = 'calling';
  try {
    await createLog(target, 'outbound');
    window.OMICallSDK.makeCall(remoteNumber, { isVideo: false });
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Không thể gọi';
    await finish('failed', errorMessage.value);
  }
}

async function callPeer(peer: PhonePeer) {
  if (!peer.omicallExtension) return;
  await startOutgoing(peer, peer.omicallExtension);
}

async function callPhone(rawPhone: string) {
  const phoneNumber = normalizeVnPhone(rawPhone);
  if (!phoneNumber) {
    errorMessage.value = 'Số điện thoại Việt Nam không hợp lệ';
    return;
  }
  await startOutgoing(phoneNumber, phoneNumber);
}

function answer() { activeCall?.accept?.(); }
function reject() { activeCall?.decline?.(); void finish('rejected'); }
function hangup() { activeCall?.end?.(); void finish('completed'); }
function toggleMute() { muted.value = !muted.value; activeCall?.mute?.(muted.value); }
function resetEnded() {
  if (phase.value === 'ended') {
    phase.value = window.OMICallSDK ? 'ready' : 'connecting';
    activePeer.value = null;
    localCallId = null;
    elapsedSec.value = 0;
  }
}

export function useOmicallSoftphone() {
  return {
    phase, errorMessage, peers, history, activePeer, incoming, muted, elapsedSec, enabled,
    isBusy: computed(() => ['calling', 'ringing', 'answered'].includes(phase.value)),
    fromNumber, initialize, callPeer, callPhone, answer, reject, hangup, toggleMute, resetEnded,
  };
}
