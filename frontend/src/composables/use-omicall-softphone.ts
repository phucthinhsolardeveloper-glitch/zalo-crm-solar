import { computed, ref } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

declare global {
  interface Window {
    OMIToastify?: OmicallToastFactory;
    Toastify?: OmicallToastFactory;
    OMICallSDK?: {
      init: (config: Record<string, unknown>) => Promise<boolean>;
      register: (config: { sipRealm: string; sipUser: string; sipPassword: string; wssUri?: string }) => Promise<{ status: string | boolean; message?: string; error?: string }>;
      unregister: () => void;
      // Bận/Không nhận cuộc gọi (DND) — đổi trạng thái đăng ký SIP sang BUSY để tổng đài
      // tự chối cuộc gọi đến, KHÔNG cần unregister/register lại toàn bộ.
      reregister: (state: unknown) => void;
      SB_STATE: { BUSY: unknown; [key: string]: unknown };
      makeCall: (remoteNumber: string, options?: {
        isVideo?: boolean;
        sipNumber?: { number: string };
      }) => void;
      on: (event: string, cb: (data: any) => void) => void;
      off: (event: string, cb: (data: any) => void) => void;
    };
  }
}

interface OmicallToastOptions {
  text?: string;
  [key: string]: unknown;
}

interface OmicallToastInstance {
  showToast: () => void;
  hideToast?: () => void;
}

type OmicallToastFactory = ((options: OmicallToastOptions) => OmicallToastInstance) & {
  __zcrmGenericErrorFiltered?: boolean;
};

export type PhonePhase = 'disabled' | 'connecting' | 'ready' | 'calling' | 'ringing' | 'answered' | 'ended' | 'error';
export interface PhonePeer {
  id: string; fullName: string; avatarUrl?: string | null; role: string; omicallExtension: string;
  kind?: 'internal' | 'external'; phoneNumber?: string; channel?: 'internal' | 'pstn' | 'zcc';
}
export interface CallHistoryItem {
  id: string; direction: 'inbound' | 'outbound'; status: string; startedAt: string;
  channel?: 'internal' | 'pstn' | 'zcc';
  durationSec?: number | null; endReason?: string | null; externalNumber?: string | null;
  recordingId?: string | null;
  peerUser?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  contact?: { id: string; fullName?: string | null; crmName?: string | null; avatarUrl?: string | null; phone?: string | null } | null;
}

interface OmicallCallData {
  transaction_id?: string;
  transactionId?: string;
  call_uuid?: string;
  uuid?: string;
  uid?: string;
  callId?: string;
  id?: string;
  direction?: string;
  isOutbound?: boolean;
  remoteNumber?: string;
  remoteStream?: MediaStream;
  // OmiCall Web SDK 3.x exposes WebRTC media here. `remoteStream` existed in
  // older/example integrations but is not populated by 3.0.41.
  streams?: {
    local?: MediaStream;
    remote?: MediaStream;
  };
  reason?: string;
  sipReason?: string;
  rejectCode?: string;
  accept?: () => void;
  decline?: () => void;
  end?: () => void;
  mute?: (muted: boolean) => void;
}

interface ExternalCallTarget {
  kind: 'external';
  phoneNumber: string;
  fullName: string;
  avatarUrl?: string | null;
  contactId?: string;
  conversationId?: string;
  channel: 'pstn' | 'zcc';
  sipNumber?: string | null;
}

function isExternalCallTarget(target: PhonePeer | ExternalCallTarget | string): target is ExternalCallTarget {
  return typeof target !== 'string' && target.kind === 'external' && 'channel' in target && 'phoneNumber' in target;
}

const SDK_URL = 'https://cdn.omicrm.com/sdk/web/3.0.41/core.min.js';
const OMICALL_SYNC_TOAST_THROTTLE_MS = 5 * 60_000;
let lastOmicallSyncToastAt = 0;
const phase = ref<PhonePhase>('connecting');
const errorMessage = ref('');
const peers = ref<PhonePeer[]>([]);
const history = ref<CallHistoryItem[]>([]);
const historyTotal = ref(0);
const historyHasMore = ref(false);
const historyLoading = ref(false);
const activePeer = ref<PhonePeer | null>(null);
const incoming = ref(false);
const muted = ref(false);
const elapsedSec = ref(0);
const enabled = ref(true);
const fromNumber = ref<string | null>(null);
const outboundNumberMode = ref<'auto' | 'fixed'>('auto');
const zccEnabled = ref(false);
const zccSipNumber = ref<string | null>(null);
// Bận/Không nhận cuộc gọi (DND) — bật: reregister SB_STATE.BUSY (tổng đài tự chối cuộc gọi
// đến, KHÔNG ảnh hưởng cuộc gọi đi). Tắt: register() lại bình thường qua initialize(true).
const doNotDisturb = ref(false);
const dialogRequest = ref(0);
const remoteAudioBlocked = ref(false);
let activeCall: OmicallCallData | null = null;
// Exposed as activeCallLogId so UI can attach a post-call note to the exact call
// (e.g. right after it ends) without re-deriving which TelephonyCall row it was.
const activeCallLogId = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
let initialized: Promise<void> | null = null;
let sdkInitialized = false;
let terminalHandled = false;
let historyPage = 1;
const HISTORY_PAGE_SIZE = 20;

/**
 * OmiCall SDK maps an empty provider error to its own generic toast
 * "Có lỗi xảy ra". CRM already renders the actionable backend error (invalid,
 * expired or misconfigured API credentials), so showing both is duplicate and
 * the generic red toast obscures the useful message.
 *
 * Keep all specific SDK messages; suppress only that generic fallback.
 */
function suppressGenericOmicallToast() {
  const toastFactory = window.OMIToastify || window.Toastify;
  if (!toastFactory || window.OMIToastify?.__zcrmGenericErrorFiltered) return;

  const filteredFactory = ((options: OmicallToastOptions) => {
    const message = String(options?.text || '').trim().replace(/[.!]+$/, '');
    if (message === 'Có lỗi xảy ra') {
      return { showToast: () => undefined, hideToast: () => undefined };
    }
    return toastFactory(options);
  }) as OmicallToastFactory;

  filteredFactory.__zcrmGenericErrorFiltered = true;
  window.OMIToastify = filteredFactory;
}

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
  return call?.transaction_id || call?.transactionId || call?.call_uuid || call?.uuid || call?.callId || call?.id;
}

function remoteMediaStream(call?: OmicallCallData | null): MediaStream | null {
  return call?.streams?.remote || call?.remoteStream || null;
}

async function attachRemoteAudio(call?: OmicallCallData | null) {
  const audio = document.getElementById('omicall-remote-audio') as HTMLAudioElement | null;
  const stream = remoteMediaStream(call);
  if (!audio || !stream) return false;

  audio.autoplay = true;
  audio.muted = false;
  audio.volume = 1;
  if (audio.srcObject !== stream) audio.srcObject = stream;

  const play = async () => {
    try {
      await audio.play();
      remoteAudioBlocked.value = false;
      return true;
    } catch {
      remoteAudioBlocked.value = true;
      return false;
    }
  };
  stream.addEventListener('addtrack', () => void play(), { once: true });
  return play();
}

function resumeRemoteAudio() {
  return attachRemoteAudio(activeCall);
}

// LOOSE — khớp normalizePhone() backend (shared/utils/phone.ts): chấp nhận số bàn/số cũ/
// SĐT nước ngoài, KHÔNG chỉ mobile VN 84+11-12 digit. FIX 2026-08-20: bản cũ (STRICT,
// chỉ nhận 84+11-12 digit) chặn gọi lại số lịch sử/số nước ngoài dù backend đã lưu được —
// nút Gọi hiện ra nhưng bấm báo "Số điện thoại Việt Nam không hợp lệ". Giữ permission-check
// (được phép gọi AI) tách biệt khỏi format-check này.
function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 13) return null;
  if (digits.startsWith('0') && (digits.length === 10 || digits.length === 11)) {
    return `84${digits.slice(1)}`;
  }
  if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) {
    return digits;
  }
  if (digits.length === 9) return `84${digits}`;
  // Số khác (nước ngoài/dạng lạ) — giữ nguyên digits, để tổng đài/backend tự quyết định
  // có gọi được không thay vì chặn cứng ở FE.
  return digits;
}

async function refreshHistory(options: { append?: boolean; page?: number } = {}) {
  if (historyLoading.value) return;
  const append = Boolean(options.append);
  const page = options.page || 1;
  historyLoading.value = true;
  try {
    const { data } = await api.get<{
      calls: CallHistoryItem[];
      pagination?: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean };
    }>('/telephony/calls', { params: { page, pageSize: HISTORY_PAGE_SIZE } });
    if (append) {
      const knownIds = new Set(history.value.map((item) => item.id));
      history.value = [...history.value, ...data.calls.filter((item) => !knownIds.has(item.id))];
    } else {
      history.value = data.calls;
    }
    historyPage = data.pagination?.page || page;
    historyTotal.value = data.pagination?.total ?? history.value.length;
    historyHasMore.value = data.pagination?.hasMore ?? data.calls.length === HISTORY_PAGE_SIZE;
  } catch { /* softphone remains usable if history fails */ }
  finally {
    historyLoading.value = false;
  }
}

async function loadMoreHistory() {
  if (!historyHasMore.value || historyLoading.value) return;
  await refreshHistory({ append: true, page: historyPage + 1 });
}

async function syncHistory() {
  // Show locally stored calls immediately; the provider backfill may span many
  // pages and should not leave the history panel empty while it is running.
  await refreshHistory();
  try {
    await api.post('/telephony/omicall/sync', { days: 30 }, { skipErrorToast: true } as any);
  } catch (error: any) {
    // Webhook-only mode remains fully usable when history backfill is unavailable,
    // but surface provider configuration errors instead of failing silently.
    const details = error?.response?.data;
    const isProviderConfigError = details?.provider === 'omicall'
      && typeof details?.code === 'string'
      && details.code.startsWith('omicall_api_');
    if (isProviderConfigError && Date.now() - lastOmicallSyncToastAt >= OMICALL_SYNC_TOAST_THROTTLE_MS) {
      lastOmicallSyncToastAt = Date.now();
      useToast().warning(details.error || 'OmiCall không thể đồng bộ lịch sử cuộc gọi');
    }
  } finally {
    await refreshHistory();
  }
}

function scheduleCdrRefresh() {
  // OMICall creates the recording asynchronously after hangup. Refresh a few
  // times so the CDR duration and recording URL appear without reloading CRM.
  for (const delay of [3_000, 8_000, 20_000]) {
    setTimeout(() => void refreshHistory(), delay);
  }
}

async function patchLog(status: string, extra: Record<string, unknown> = {}) {
  if (!activeCallLogId.value) return;
  try { await api.patch(`/telephony/calls/${activeCallLogId.value}`, { status, ...extra }); } catch { /* best effort */ }
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
  remoteAudioBlocked.value = false;
  const audio = document.getElementById('omicall-remote-audio') as HTMLAudioElement | null;
  if (audio) {
    audio.pause();
    audio.srcObject = null;
  }
  void refreshHistory();
  scheduleCdrRefresh();
}

async function createLog(
  target: PhonePeer | ExternalCallTarget | string,
  direction: 'inbound' | 'outbound',
  call?: OmicallCallData,
) {
  const external = typeof target === 'string'
    ? { phoneNumber: target, channel: 'pstn' as const }
    : isExternalCallTarget(target) ? target : null;
  const { data } = await api.post('/telephony/calls', {
    ...(external
      ? {
          phoneNumber: external.phoneNumber,
          channel: external.channel,
          ...('contactId' in external && external.contactId ? { contactId: external.contactId } : {}),
          ...('conversationId' in external && external.conversationId ? { conversationId: external.conversationId } : {}),
        }
      : { peerUserId: (target as PhonePeer).id }),
    direction,
    providerCallId: providerCallId(call),
  });
  activeCallLogId.value = data.id;
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
    errorMessage.value = data?.message || data?.error || data?.reason || 'Omicall đã ngắt kết nối tổng đài';
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
  // 183 early-media (ringback/provider announcement) can already carry the
  // remote receiver stream before the call is accepted.
  void attachRemoteAudio(callData);
};

const connectingHandler = (callData: OmicallCallData) => {
  if (callData.direction === 'inbound' || callData.isOutbound === false) return;
  activeCall = callData;
  phase.value = 'calling';
  const id = providerCallId(callData);
  if (id) void patchLog('initiated', { providerCallId: id });
};

const acceptedHandler = (callData: OmicallCallData) => {
  activeCall = callData;
  phase.value = 'answered';
  incoming.value = false;
  startTimer();
  const id = providerCallId(callData);
  void patchLog('answered', id ? { providerCallId: id } : {});
  // In SDK 3.0.41 `streams.remote` is created immediately before `accepted`
  // is emitted, so this is the reliable point to connect the customer's voice.
  void attachRemoteAudio(callData);
};

const endedHandler = (callData: OmicallCallData) => {
  const reason = String(callData?.reason || callData?.sipReason || callData?.rejectCode || '');
  const fallback = phase.value === 'answered' ? 'completed' : (incoming.value ? 'missed' : 'rejected');
  void finish(fallback, reason);
};

function bindSdkEvents() {
  const sdk = window.OMICallSDK;
  if (!sdk) return;
  sdk.off('register', registerHandler);
  sdk.off('connecting', connectingHandler);
  sdk.off('ringing', ringingHandler);
  sdk.off('accepted', acceptedHandler);
  sdk.off('ended', endedHandler);
  sdk.on('register', registerHandler);
  sdk.on('connecting', connectingHandler);
  sdk.on('ringing', ringingHandler);
  sdk.on('accepted', acceptedHandler);
  sdk.on('ended', endedHandler);
}

async function connect() {
  phase.value = 'connecting';
  errorMessage.value = '';
  try {
    const [{ data }] = await Promise.all([
      // skipErrorToast: 503 "chưa được gán extension" là trạng thái nghiệp vụ bình
      // thường (nhân viên mới/chưa cấp), không phải server lỗi — UI dưới đây tự xử lý
      // qua errorMessage, không cần toast "Máy chủ lỗi" gây hoang mang.
      api.get('/telephony/omicall/connect-config', { skipErrorToast: true } as any),
      loadSdk(),
    ]);
    enabled.value = Boolean(data.enabled);
    peers.value = data.peers;
    fromNumber.value = data.hotline || null;
    outboundNumberMode.value = data.outboundNumberMode === 'fixed' ? 'fixed' : 'auto';
    zccEnabled.value = Boolean(data.zcc?.enabled);
    zccSipNumber.value = data.zcc?.sipNumber || null;
    if (!window.OMICallSDK) throw new Error('Omicall SDK chưa sẵn sàng');
    suppressGenericOmicallToast();
    // Theo luồng chính thức của OmiCall v3: init đúng một lần; reconnect chỉ
    // unregister/register. Gọi init() lặp lại có thể để lại transport/event cũ
    // và khiến lần đăng ký kế tiếp bị SDK từ chối dù credential vẫn đúng.
    if (!sdkInitialized) {
      const initializedOk = await window.OMICallSDK.init({});
      if (!initializedOk) throw new Error('Không khởi tạo được OmiCall Web SDK');
      sdkInitialized = true;
    } else {
      try { window.OMICallSDK.unregister(); } catch { /* register below still retries */ }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    bindSdkEvents();
    const result = await window.OMICallSDK.register({
      sipRealm: data.sipRealm,
      sipUser: data.sipUser,
      sipPassword: data.sipPassword,
      ...(data.wssUri ? { wssUri: data.wssUri } : {}),
    });
    phase.value = result?.status === 'connected'
      ? 'ready'
      : (result?.status === 'connecting' || result?.status === true) ? 'connecting' : 'error';
    if (phase.value === 'error') {
      errorMessage.value = result?.message || result?.error || 'Omicall từ chối đăng nhập';
    }
    void syncHistory();
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

// Bật: reregister SB_STATE.BUSY — tổng đài chuyển sang "bận", tự chối cuộc gọi đến, không
// cần unregister/register lại. Tắt: register() lại từ đầu qua initialize(true) (đơn giản,
// tái dùng đúng luồng "Kết nối lại" đã có, đảm bảo về đúng trạng thái sẵn sàng nhận cuộc gọi).
async function setDoNotDisturb(value: boolean) {
  const sdk = window.OMICallSDK;
  if (!sdk) return;
  try {
    if (value) {
      sdk.reregister(sdk.SB_STATE.BUSY);
      doNotDisturb.value = true;
    } else {
      await initialize(true);
      doNotDisturb.value = false;
    }
  } catch {
    // Best effort — DND chỉ là tiện ích, không chặn luồng gọi chính nếu SDK từ chối đổi trạng thái.
  }
}
function toggleDoNotDisturb() {
  void setDoNotDisturb(!doNotDisturb.value);
}

async function startOutgoing(target: PhonePeer | ExternalCallTarget, remoteNumber: string) {
  dialogRequest.value += 1;
  errorMessage.value = '';
  if (!window.OMICallSDK || phase.value !== 'ready') {
    throw new Error('Tổng đài Omicall chưa sẵn sàng');
  }
  const external = isExternalCallTarget(target);
  activePeer.value = external
    ? {
        id: target.contactId || remoteNumber,
        fullName: target.fullName,
        avatarUrl: target.avatarUrl,
        role: 'contact',
        omicallExtension: remoteNumber,
        kind: 'external',
        phoneNumber: target.phoneNumber,
        channel: target.channel,
      }
    : { ...target, kind: 'internal', channel: 'internal' };
  incoming.value = false;
  terminalHandled = false;
  elapsedSec.value = 0;
  phase.value = 'calling';
  try {
    await createLog(target, 'outbound');
    window.OMICallSDK.makeCall(remoteNumber, {
      isVideo: false,
      // In auto mode, omit sipNumber so Omicall can apply provider-side
      // routing such as same-network priority. Fixed mode remains available
      // for deployments that must always present one configured hotline.
      ...(external && target.sipNumber
        ? { sipNumber: { number: target.sipNumber } }
        : external && outboundNumberMode.value === 'fixed' && fromNumber.value
          ? { sipNumber: { number: fromNumber.value } }
          : {}),
    });
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || error?.message || 'Không thể gọi';
    await finish('failed', errorMessage.value);
    throw error;
  }
}

async function callPeer(peer: PhonePeer) {
  if (!peer.omicallExtension) return;
  await startOutgoing(peer, peer.omicallExtension);
}

async function callPhone(rawPhone: string, opts: { contactId?: string; fullName?: string; avatarUrl?: string | null } = {}) {
  const phoneNumber = normalizeVnPhone(rawPhone);
  if (!phoneNumber) {
    errorMessage.value = 'Số điện thoại Việt Nam không hợp lệ';
    dialogRequest.value += 1;
    throw new Error(errorMessage.value);
  }
  await startOutgoing({
    kind: 'external',
    phoneNumber,
    fullName: opts.fullName || phoneNumber,
    avatarUrl: opts.avatarUrl,
    contactId: opts.contactId,
    channel: zccEnabled.value ? 'zcc' : 'pstn',
    sipNumber: zccEnabled.value ? zccSipNumber.value : null,
  }, phoneNumber);
}

async function callConversation(conversationId: string) {
  if (['calling', 'ringing', 'answered'].includes(phase.value)) {
    dialogRequest.value += 1;
    throw new Error('Bạn đang có một cuộc gọi khác');
  }
  const { data } = await api.post<{
    conversationId: string;
    contactId: string;
    remoteNumber: string;
    channel: 'pstn' | 'zcc';
    sipNumber?: string | null;
    contact: { id: string; fullName: string; avatarUrl?: string | null; phone: string };
  }>('/telephony/omicall/resolve-conversation-target', { conversationId }, { skipErrorToast: true } as any);
  await startOutgoing({
    kind: 'external',
    phoneNumber: data.contact.phone,
    fullName: data.contact.fullName,
    avatarUrl: data.contact.avatarUrl,
    contactId: data.contactId,
    conversationId: data.conversationId,
    channel: data.channel,
    sipNumber: data.sipNumber,
  }, data.remoteNumber);
}

function answer() { activeCall?.accept?.(); }
function reject() { activeCall?.decline?.(); void finish('rejected'); }
function hangup() { activeCall?.end?.(); void finish('completed'); }
function toggleMute() { muted.value = !muted.value; activeCall?.mute?.(muted.value); }
function resetEnded() {
  if (phase.value === 'ended') {
    phase.value = window.OMICallSDK ? 'ready' : 'connecting';
    activePeer.value = null;
    activeCallLogId.value = null;
    elapsedSec.value = 0;
  }
}

export function useOmicallSoftphone() {
  return {
    phase, errorMessage, peers, history, historyTotal, historyHasMore, historyLoading,
    activePeer, incoming, muted, elapsedSec, enabled, zccEnabled, dialogRequest, activeCallLogId,
    remoteAudioBlocked, doNotDisturb,
    isBusy: computed(() => ['calling', 'ringing', 'answered'].includes(phase.value)),
    fromNumber, initialize, callPeer, callPhone, callConversation,
    answer, reject, hangup, toggleMute, resetEnded, resumeRemoteAudio, loadMoreHistory,
    toggleDoNotDisturb,
  };
}
