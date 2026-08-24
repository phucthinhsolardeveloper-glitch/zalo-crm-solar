# Omicall ZCC calling from personal-Zalo CRM chats

Date: 2026-07-27

## Product boundary

- Employees continue messaging customers through their assigned personal Zalo
  accounts in ZaloCRM.
- Voice calls do not use the personal Zalo account. Every customer call is
  placed through the company's Zalo OA/ZCC number provisioned in Omicall.
- A personal-Zalo conversation UID is not assumed to be an OA-scoped UID.
  The bridge resolves the CRM contact's phone number and uses that as the ZCC
  destination.
- If the contact has no valid Vietnamese phone number, calling from the chat is
  blocked with an actionable error. No UID fallback is attempted.

## User flows

### Call from a conversation

1. Employee opens a one-to-one conversation.
2. Employee clicks the phone button in the conversation header.
3. Backend verifies organization, conversation and employee access to the
   personal Zalo account.
4. Backend resolves the first valid number from `phone`, `phone2`, `phone3` or
   `phonesExtra`.
5. Backend returns the configured company ZCC SIP number.
6. The employee's own Omicall extension calls the customer through that ZCC
   number.
7. The shared softphone opens automatically and shows call state.
8. Call history is linked to the employee, CRM contact and source conversation.

### Manual number

- The existing manual dial field remains available.
- Before ZCC is enabled it keeps the existing PSTN/Omicall behaviour.
- After ZCC is enabled it uses the configured company ZCC SIP number.

## Concurrency

- Every CRM employee has a distinct Omicall SIP extension and browser
  registration.
- Call state is local to that employee's browser session; there is no
  organization-wide application lock.
- Multiple employees can therefore call concurrently up to the channel/CCU
  limits provisioned by Omicall and Zalo OA.
- One employee is limited to one active call in the custom CRM softphone.

## Configuration

```env
OMICALL_ENABLED=true
OMICALL_DOMAIN=
OMICALL_WSS_URI=
OMICALL_ZCC_ENABLED=false
OMICALL_ZCC_SIP_NUMBER=
OMICALL_WEBHOOK_SECRET=<REDACTED_LEGACY_VALUE>
OMICALL_API_KEY=<REDACTED_LEGACY_VALUE>
OMICALL_API_BASE_URL=
```

`OMICALL_ZCC_ENABLED` must remain `false` until Omicall has bound the company OA
and confirmed the ZCC SIP number.

## Call records

`TelephonyCall` stores:

- `ownerUserId`: employee extension owner;
- `contactId`: resolved CRM customer;
- `conversationId`: source personal-Zalo conversation;
- `channel`: `internal`, `pstn` or `zcc`;
- `externalIdentity` and `externalIdentityType`;
- Omicall transaction ID, status, duration and recording URL.

Webhook and history backfill classify a call as ZCC when the Omicall
`sip_number`/`hotline` equals `OMICALL_ZCC_SIP_NUMBER`.

## Items Omicall must still confirm

1. Production SIP realm, WSS/ICE configuration and one extension per employee.
2. The exact ZCC SIP number to pass as `MakeCallOptions.sipNumber.number`.
3. Whether calling by customer phone number requires a prior OA voice-consent
   request and the API/event contract for that consent.
4. How custom SDK UI should implement `validateCallOut`, including error codes
   and permission-expiry behaviour.
5. ZCC webhook samples for inbound, outbound, rejected and transferred calls.
6. Whether ZCC webhook `sip_number` or `hotline` is the stable channel
   discriminator.
7. Recording URL authentication and retention.
8. Concurrent channel/CCU quota and routing when the quota is exhausted.
9. Webhook retry, ordering, source IPs and production authentication options.

## Production gate

Do not enable ZCC until a sandbox or controlled OA test passes:

- two different employee extensions call two customers concurrently;
- chat call always displays the company OA;
- a contact without a phone number is blocked;
- an unauthorized/expired-consent call returns a clear error;
- webhook reconciles the correct employee, contact and conversation;
- recording appears in CRM after hangup;
- repeated/out-of-order webhook delivery does not duplicate call records.
