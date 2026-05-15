const sessionStorageKey = "prompt_capture_client_session_id";
const failureQueueKey = "prompt_capture_failures_v1";

export type QueuedPromptPayload = {
  content: string;
  clientSessionId: string;
  sourceUrl: string;
  idempotencyKey: string;
};

export function shouldSkipPromptCapture(pathname: string, root?: ParentNode | null) {
  if (pathname.startsWith("/auth")) {
    return true;
  }

  return Boolean(root?.querySelector('input[type="password"]'));
}

export function findPromptCandidate(root: ParentNode) {
  const fields = Array.from(
    root.querySelectorAll<HTMLTextAreaElement | HTMLInputElement | HTMLElement>(
      'textarea, input[type="text"], input[type="search"], [contenteditable="true"]',
    ),
  );
  const candidates = fields
    .map((field) => getFieldText(field))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && value.length <= 20000)
    .sort((a, b) => b.length - a.length);

  return candidates[0] ?? null;
}

export function getOrCreateClientSessionId(
  storage: Storage,
  createId: () => string = () => crypto.randomUUID(),
) {
  const existing = storage.getItem(sessionStorageKey);

  if (existing) {
    return existing;
  }

  const next = createId();
  storage.setItem(sessionStorageKey, next);
  return next;
}

export function readQueuedPrompts(storage: Storage): QueuedPromptPayload[] {
  try {
    const value = storage.getItem(failureQueueKey);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export function enqueuePrompt(storage: Storage, payload: QueuedPromptPayload) {
  const queue = readQueuedPrompts(storage);
  queue.push(payload);
  storage.setItem(failureQueueKey, JSON.stringify(queue.slice(-25)));
}

export function replaceQueuedPrompts(storage: Storage, queue: QueuedPromptPayload[]) {
  if (queue.length === 0) {
    storage.removeItem(failureQueueKey);
    return;
  }

  storage.setItem(failureQueueKey, JSON.stringify(queue.slice(-25)));
}

export async function createPromptIdempotencyKey(payload: {
  content: string;
  clientSessionId: string;
  sourceUrl: string;
}) {
  const material = `${payload.clientSessionId}\n${payload.sourceUrl}\n${payload.content}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getFieldText(field: HTMLTextAreaElement | HTMLInputElement | HTMLElement) {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    return field.value;
  }

  return field.textContent ?? "";
}
