export interface ObservatoryPrivacyCounts {
  absolute_or_private_path: number;
  browser_data: number;
  config_or_payload_data: number;
  email: number;
  raw_content: number;
  secret_key: number;
  secret_value: number;
  session_data: number;
}

const PATTERNS = {
  secretKey:
    /(?:password|passwd|secret|token|credential|authorization|private[_-]?key|api[_-]?key|service[_-]?role)/iu,
  secretValue:
    /(?:bearer\s+[a-z0-9._~+/=-]{12,}|(?:^|[^a-z0-9])(?:sk|ghp|xox[abprs])[-_][a-z0-9_-]{16,}|(?:^|[^a-z0-9])eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})/iu,
  privatePath:
    /(?:\/(?:Users|home)\/|[a-z]:\\|\.openclaw\/|Obsidian\/|Glaucon[^/]*Vault)/iu,
  email:
    /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/iu,
  sessionKey:
    /^(?:session:[a-z0-9._:-]+|agent:[^\s:/]+:(?:main|(?:telegram|discord|slack|signal|whatsapp):[^\s]+))$/iu,
  sessionFieldKey: /^(?:session|sessionkey|sessionid|sessionpath|sessiontoken)$/iu,
  rawContentKey:
    /^(?:raw|content|body|markdown|html|note|notes|prompt|transcript|document|message|text)$/iu,
  browserKey:
    /^(?:cookie|cookies|localstorage|sessionstorage|browser|browser_data)$/iu,
  configPayloadKey:
    /^(?:payload|delivery|destination|environment|env|config_value|command_output|stderr|stdout)$/iu,
};

export function scanObservatoryPrivacy(input: unknown): ObservatoryPrivacyCounts {
  const counts: ObservatoryPrivacyCounts = {
    absolute_or_private_path: 0,
    browser_data: 0,
    config_or_payload_data: 0,
    email: 0,
    raw_content: 0,
    secret_key: 0,
    secret_value: 0,
    session_data: 0,
  };

  function scan(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (PATTERNS.secretKey.test(key)) counts.secret_key += 1;
        if (PATTERNS.sessionFieldKey.test(key)) counts.session_data += 1;
        if (PATTERNS.rawContentKey.test(key)) counts.raw_content += 1;
        if (PATTERNS.browserKey.test(key)) counts.browser_data += 1;
        if (PATTERNS.configPayloadKey.test(key)) {
          counts.config_or_payload_data += 1;
        }
        scan(child);
      }
      return;
    }
    if (typeof value !== "string") return;
    if (PATTERNS.secretValue.test(value)) counts.secret_value += 1;
    if (PATTERNS.privatePath.test(value)) counts.absolute_or_private_path += 1;
    if (PATTERNS.email.test(value)) counts.email += 1;
    if (PATTERNS.sessionKey.test(value)) counts.session_data += 1;
  }

  scan(input);
  return counts;
}
