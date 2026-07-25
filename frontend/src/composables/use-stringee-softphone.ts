import { computed, ref } from 'vue';
import { api } from '@/api';

export type PhonePhase = 'disabled' | 'connecting' | 'ready' | 'calling' | 'ringing' | 'answered' | 'ended' | 'error';
export interface PhonePeer { id: string; fullName: string; avatarUrl?: string | null; role: string; stringeeUserId: string }
export interface PhoneParty {
  kind: 'internal' | 'external'; id?: string; fullName: string; avatarUrl?: string | null;
  role?: string; stringeeUserId?: string; phoneNumber?: string;
}
export interface CallHistoryItem {
  id: string; direction: 'inbound' | 'outbound'; status: string; startedAt: string;
  durationSec?: number | null; endReason?: string | null; externalNumber?: string | null;
  peerUser?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  contact?: { id: string; fullName?: string | null; crmName?: string | null; avatarUrl?: string | null; phone?: string | null } | null;
}

const SDK_URL = 'https://cdn.stringee.com/sdk/web/latest/stringee-web-sdk.min.js';
const phase = ref<PhonePhase>('connecting');
const errorMessage = ref('');
const peers = ref<PhonePeer[]>([]);
const history = ref<CallHistoryItem[]>([]);
const activePeer = ref<PhoneParty | null>(null);
const incoming = ref(false);
const muted = ref(false);
const elapsedSec = ref(0);
const enabled = ref(true);
const fromNumber = ref<string | null>(null);
let client: StringeeClient | null = null;
let activeCall: StringeeCall | null = null;
let localCallId: string | null = null;
let ownStringeeId = '';
let timer: ReturnType<typeof setInterval> | null = null;
let initialized: Promise<void> | null = null;
let terminalHandled = false;

function normalizeVnPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  let normalized = digits;
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) normalized = `84${digits.slice(1)}`;
  else if (digits.length === 9) normalized = `84${digits}`;
  return /^84\d{9,10}$/.test(normalized) ? normalized : null;
}

function loadSdk(): Promise<void> {
  if (window.StringeeClient && window.StringeeCall) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error('Không tải được Stringee Web SDK')), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL; script.async = true; script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Stringee Web SDK'));
    document.head.appendChild(script);
  });
}

function providerCallId(call: StringeeCall, response?: any): string | undefined {
  return response?.callId || response?.call_id || call.callId || call.id;
}
async function refreshHistory() {
  try {
    const { data } = await api.get<{ calls: CallHistoryItem[] }>('/telephony/calls', { params: { limit: 20 } });
    history.value = data.calls;
  } catch { /* history is best effort */ }
}
async function patchLog(status: string, extra: Record<string, unknown> = {}) {
  if (!localCallId) return;
  try { await api.patch(`/telephony/calls/${localCallId}`, { status, ...extra }); } catch { /* webhook can reconcile later */ }
}
function startTimer() { if (timer) clearInterval(timer); elapsedSec.value = 0; timer = setInterval(() => { elapsedSec.value += 1; }, 1000); }
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
async function finish(status: 'completed' | 'rejected' | 'missed' | 'failed', reason?: string) {
  if (terminalHandled) return;
  terminalHandled = true; stopTimer();
  await patchLog(status, { durationSec: elapsedSec.value, endReason: reason || undefined });
  if (status === 'failed' && reason) {
    errorMessage.value = reason.includes('CALL_NOT_ALLOWED_BY_YOUR_SERVER')
      ? 'Stringee PCC từ chối cuộc gọi: kiểm tra quyền gọi ra và Stringee User ID của Agent.'
      : reason;
  }
  phase.value = 'ended'; activeCall = null; incoming.value = false; muted.value = false;
  void refreshHistory();
}
function mapSignalState(state: any): { status?: string; terminal?: boolean; reason?: string } {
  const code = Number(state?.code ?? state?.state);
  const reason = String(state?.reason || state?.sipReason || '').toLowerCase();
  if (code === 0 || reason.includes('calling')) return { status: 'calling' };
  if (code === 1 || reason.includes('ringing')) return { status: 'ringing' };
  if (code === 2 || reason.includes('answer')) return { status: 'answered' };
  if (code === 3 || reason.includes('busy') || reason.includes('reject')) return { status: 'rejected', terminal: true, reason };
  if (code === 4 || reason.includes('ended') || reason.includes('hangup')) return { status: 'completed', terminal: true, reason };
  return { reason };
}
function bindCallEvents(call: StringeeCall) {
  call.on('addremotestream', (stream: MediaStream) => {
    const audio = document.getElementById('stringee-remote-audio') as HTMLAudioElement | null;
    if (audio) { audio.srcObject = stream; void audio.play().catch(() => undefined); }
  });
  call.on('signalingstate', (state: any) => {
    const mapped = mapSignalState(state);
    if (mapped.status === 'ringing') { phase.value = 'ringing'; void patchLog('ringing'); }
    if (mapped.status === 'answered') { phase.value = 'answered'; incoming.value = false; startTimer(); void patchLog('answered'); }
    if (mapped.terminal) {
      const fallback = phase.value === 'answered' ? 'completed' : (incoming.value ? 'missed' : mapped.status);
      void finish(fallback as 'completed' | 'rejected' | 'missed', mapped.reason);
    }
  });
}

async function createLog(party: PhoneParty, direction: 'inbound' | 'outbound', call?: StringeeCall) {
  const { data } = await api.post('/telephony/calls', {
    ...(party.kind === 'internal' ? { peerUserId: party.id } : { phoneNumber: party.phoneNumber }),
    direction, providerCallId: call ? providerCallId(call) : undefined,
  });
  localCallId = data.id;
  if (party.kind === 'external' && data.contact) {
    activePeer.value = {
      ...party, id: data.contact.id,
      fullName: data.contact.crmName || data.contact.fullName || party.phoneNumber,
      avatarUrl: data.contact.avatarUrl,
    };
  }
}
async function handleIncoming(call: StringeeCall) {
  if (activeCall) { call.reject(() => undefined); return; }
  const from = call.fromNumber || '';
  const internal = peers.value.find((item) => item.stringeeUserId === from);
  const phone = internal ? null : normalizeVnPhone(from);
  if (!internal && !phone) { call.reject(() => undefined); return; }
  const party: PhoneParty = internal
    ? { ...internal, kind: 'internal' }
    : { kind: 'external', fullName: phone!, phoneNumber: phone! };
  activeCall = call; activePeer.value = party; incoming.value = true; terminalHandled = false;
  elapsedSec.value = 0; phase.value = 'ringing'; bindCallEvents(call);
  try { await createLog(party, 'inbound', call); } catch { /* call remains answerable */ }
}

async function connect() {
  phase.value = 'connecting'; errorMessage.value = '';
  try {
    const [{ data }] = await Promise.all([api.get('/telephony/stringee/token'), loadSdk()]);
    enabled.value = Boolean(data.enabled); peers.value = data.peers; ownStringeeId = data.userId;
    fromNumber.value = data.fromNumber || null;
    if (!window.StringeeClient) throw new Error('Stringee SDK chưa sẵn sàng');
    client?.disconnect(); client = new window.StringeeClient();
    client.on('authen', (result: any) => {
      if (result?.r === 0 || result?.userId) phase.value = 'ready';
      else { phase.value = 'error'; errorMessage.value = result?.message || 'Stringee từ chối đăng nhập'; }
    });
    client.on('disconnect', () => { if (!activeCall) phase.value = 'connecting'; });
    client.on('requestnewtoken', () => { initialized = null; void initialize(true); });
    client.on('incomingcall', (call: StringeeCall) => void handleIncoming(call));
    client.connect(data.accessToken); void refreshHistory();
  } catch (error: any) {
    if (error?.response?.status === 503) enabled.value = false;
    phase.value = enabled.value ? 'error' : 'disabled';
    errorMessage.value = error?.response?.data?.error || error?.message || 'Không kết nối được tổng đài';
  }
}
function initialize(force = false): Promise<void> { if (force) initialized = null; if (!initialized) initialized = connect(); return initialized; }

async function startOutgoing(party: PhoneParty, from: string, to: string) {
  if (!client || phase.value !== 'ready' || !window.StringeeCall) return;
  activePeer.value = party; incoming.value = false; terminalHandled = false; elapsedSec.value = 0; phase.value = 'calling';
  try {
    await createLog(party, 'outbound');
    const call = new window.StringeeCall(client, from, to, false);
    activeCall = call; bindCallEvents(call);
    call.makeCall((result: any) => {
      const id = providerCallId(call, result);
      if (id) void patchLog('initiated', { providerCallId: id });
      if (result?.r && result.r !== 0) void finish('failed', result?.message || 'makeCall failed');
    });
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Không thể gọi';
    await finish('failed', errorMessage.value);
  }
}
async function callPeer(peer: PhonePeer) {
  await startOutgoing({ ...peer, kind: 'internal' }, ownStringeeId, peer.stringeeUserId);
}
async function callPhone(input: string) {
  const phone = normalizeVnPhone(input);
  if (!phone) { errorMessage.value = 'Số điện thoại Việt Nam không hợp lệ'; return; }
  if (!fromNumber.value) { errorMessage.value = 'Chưa cấu hình Stringee Number gọi ra'; return; }
  await startOutgoing({ kind: 'external', fullName: phone, phoneNumber: phone }, fromNumber.value, phone);
}
function answer() {
  activeCall?.answer((res: any) => {
    if (res?.r && res.r !== 0) { void finish('failed', res?.message); return; }
    incoming.value = false; phase.value = 'answered'; startTimer(); void patchLog('answered');
  });
}
function reject() { activeCall?.reject(() => void finish('rejected')); }
function hangup() { activeCall?.hangup(() => void finish('completed')); }
function toggleMute() { muted.value = !muted.value; activeCall?.mute(muted.value); }
function resetEnded() {
  if (phase.value === 'ended') { phase.value = client ? 'ready' : 'connecting'; activePeer.value = null; localCallId = null; elapsedSec.value = 0; }
}

export function useStringeeSoftphone() {
  return {
    phase, errorMessage, peers, history, activePeer, incoming, muted, elapsedSec, enabled, fromNumber,
    isBusy: computed(() => ['calling', 'ringing', 'answered'].includes(phase.value)),
    initialize, callPeer, callPhone, answer, reject, hangup, toggleMute, resetEnded, refreshHistory,
  };
}
