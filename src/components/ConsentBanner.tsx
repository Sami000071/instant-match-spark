import { useEffect, useState } from "react";

const STORAGE_KEY = "blink_consent_v1";

const EEA_UK_CH = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  "IS","LI","NO","GB","CH",
]);

type Consent = {
  ad_storage: boolean;
  ad_user_data: boolean;
  ad_personalization: boolean;
  analytics_storage: boolean;
};

const ALL_DENIED: Consent = {
  ad_storage: false,
  ad_user_data: false,
  ad_personalization: false,
  analytics_storage: false,
};

const ALL_GRANTED: Consent = {
  ad_storage: true,
  ad_user_data: true,
  ad_personalization: true,
  analytics_storage: true,
};

function pushConsent(consent: Consent) {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  function gtag(..._args: unknown[]) {
    w.dataLayer!.push(arguments);
  }
  gtag("consent", "update", {
    ad_storage: consent.ad_storage ? "granted" : "denied",
    ad_user_data: consent.ad_user_data ? "granted" : "denied",
    ad_personalization: consent.ad_personalization ? "granted" : "denied",
    analytics_storage: consent.analytics_storage ? "granted" : "denied",
  });
}

function save(consent: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    /* ignore */
  }
  pushConsent(consent);
}

function read(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

async function inRegulatedRegion(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("/cdn-cgi/trace", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return true;
    const text = await res.text();
    const loc = text.split("\n").find((l) => l.startsWith("loc="))?.slice(4).trim();
    if (!loc || loc === "XX" || loc === "T1") return true;
    return EEA_UK_CH.has(loc);
  } catch {
    return true;
  }
}

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [prefs, setPrefs] = useState<Consent>(ALL_DENIED);

  useEffect(() => {
    const stored = read();
    if (stored) {
      pushConsent(stored);
      return;
    }
    let cancelled = false;
    void inRegulatedRegion().then((regulated) => {
      if (cancelled) return;
      if (regulated) setOpen(true);
      else save(ALL_GRANTED);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setPrefs(read() ?? ALL_DENIED);
      setManage(true);
      setOpen(true);
    };
    window.addEventListener("blink:open-consent", handler);
    return () => window.removeEventListener("blink:open-consent", handler);
  }, []);

  if (!open) return null;

  const decide = (consent: Consent) => {
    save(consent);
    setOpen(false);
    setManage(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-background/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
        <h2 className="text-base font-semibold">We use cookies and ads</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          blink and our partners (including Google) use cookies to run the site, show ads and measure
          performance. You can accept, refuse, or choose what you allow. You can change this any time from the
          footer.
        </p>

        {manage && (
          <div className="mt-4 space-y-3">
            {(
              [
                ["ad_storage", "Store ad cookies"],
                ["ad_user_data", "Share data with ad partners"],
                ["ad_personalization", "Personalised ads"],
                ["analytics_storage", "Analytics & measurement"],
              ] as [keyof Consent, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={prefs[key]}
                  onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {manage ? (
            <button
              type="button"
              onClick={() => decide(prefs)}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Save choices
            </button>
          ) : (
            <button
              type="button"
              onClick={() => decide(ALL_GRANTED)}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Consent
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide(ALL_DENIED)}
              className="flex-1 rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm font-medium"
            >
              Do not consent
            </button>
            {!manage && (
              <button
                type="button"
                onClick={() => setManage(true)}
                className="flex-1 rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm font-medium"
              >
                Manage options
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function openConsentSettings() {
  window.dispatchEvent(new Event("blink:open-consent"));
}
