"use client";

// The household sign-up form. Validates with the same rules as the server (src/lib/registration.ts),
// shows one friendly sentence under each field that needs fixing, then POSTs to /api/register.

import { useId, useRef, useState } from "react";
import {
  CONSENT_TEXT,
  parseRegistration,
  type FieldErrors,
  type RegistrationInputRaw,
} from "@/lib/registration";

type Form = {
  fullName: string;
  email: string;
  phone: string;
  language: "en" | "es";
  addressLine1: string;
  addressLine2: string;
  city: string;
  zip: string;
  emergencyName: string;
  emergencyPhone: string;
  consent: boolean;
  website: string;
};

const EMPTY: Form = {
  fullName: "",
  email: "",
  phone: "",
  language: "en",
  addressLine1: "",
  addressLine2: "",
  city: "Houston",
  zip: "",
  emergencyName: "",
  emergencyPhone: "",
  consent: false,
  website: "",
};

/** Field order on the page (to focus the first one that needs fixing). */
const ORDER: (keyof Form)[] = [
  "fullName", "email", "phone", "addressLine1", "addressLine2", "city", "zip",
  "emergencyName", "emergencyPhone", "consent",
];

const inputCls =
  "mt-1.5 block w-full rounded-md border bg-bg px-3 py-2.5 text-base text-text outline-none placeholder:text-muted/60 focus-visible:border-accent";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-panel border border-border bg-surface p-5 sm:p-6">
      <legend className="float-left w-full">
        <span className="text-lg font-semibold">{title}</span>
        {note && <span className="mt-1 block text-sm text-muted">{note}</span>}
      </legend>
      <div className="clear-left space-y-5 pt-4">{children}</div>
    </fieldset>
  );
}

function ErrorText({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {text}
    </p>
  );
}

function Field(props: {
  name: keyof Form;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  optional?: boolean;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {props.label}
        {props.optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {props.hint && (
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {props.hint}
        </p>
      )}
      <input
        id={id}
        name={props.name}
        data-field={props.name}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={[props.hint && hintId, props.error && errId].filter(Boolean).join(" ") || undefined}
        className={`${inputCls} ${props.error ? "border-danger" : "border-border"}`}
      />
      <ErrorText id={errId} text={props.error} />
    </div>
  );
}

/** A row of pill-shaped choices (radio buttons). Clicking the chosen one again clears it. */
function Choice<T extends string>(props: {
  name: keyof Form;
  label: string;
  options: { value: T; label: string }[];
  value: T | "";
  error?: string;
  onChange: (v: T | "") => void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={props.error ? `${id}-err` : undefined} data-field={props.name}>
      <p id={`${id}-label`} className="text-sm font-medium">
        {props.label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {props.options.map((o) => {
          const on = props.value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                on ? "border-accent bg-accent/15 text-text" : "border-border text-muted hover:text-text"
              }`}
            >
              <input
                type="radio"
                name={props.name}
                value={o.value}
                checked={on}
                onChange={() => props.onChange(o.value)}
                onClick={() => on && props.onChange("")}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      <ErrorText id={`${id}-err`} text={props.error} />
    </div>
  );
}

export default function RegisterForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const consentId = useId();

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof FieldErrors]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const showErrors = (errs: FieldErrors) => {
    setErrors(errs);
    const first = ORDER.find((k) => errs[k as keyof FieldErrors]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const el = first && formRef.current?.querySelector<HTMLInputElement>(`[data-field="${first}"] input, input[data-field="${first}"]`);
    el?.focus({ preventScroll: true });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    // consent is a plain boolean here; the shared rules reject anything but true.
    const payload = { ...form } as unknown as RegistrationInputRaw;
    const check = parseRegistration(payload);
    if (!check.ok) return showErrors(check.errors);

    setSending(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; firstName?: string; errors?: FieldErrors; message?: string };
      if (out.ok) {
        setDone(out.firstName ?? "");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (out.errors) showErrors(out.errors);
      else setMessage(out.message ?? "We couldn't save your sign-up. Please try again in a minute.");
    } catch {
      setMessage("We couldn't reach FreezeLine. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (done !== null) {
    return (
      <section aria-live="polite" className="mt-8 rounded-panel border border-border bg-surface p-6">
        <h2 className="text-2xl font-semibold">You&rsquo;re signed up{done ? `, ${done}` : ""}.</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Before a hard freeze, we&rsquo;ll text you a short plan for your home. If you don&rsquo;t reply, we may call you to check
          that you got it.
        </p>
        <ul className="mt-5 space-y-2 text-base">
          <li className="rounded-md border border-border bg-bg px-4 py-3">Save our number so you recognize our texts.</li>
          <li className="rounded-md border border-border bg-bg px-4 py-3">Find your main water shutoff valve now, while it&rsquo;s warm.</li>
          <li className="rounded-md border border-border bg-bg px-4 py-3">Reply STOP to any text if you want us to stop.</li>
        </ul>
        <p className="mt-5 text-sm text-muted">FreezeLine is a demo right now, so we won&rsquo;t text or call you yet.</p>
      </section>
    );
  }

  const e = errors;
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mt-8 space-y-6">
      <Section title="About you">
        <Field name="fullName" label="Full name" value={form.fullName} error={e.fullName} onChange={(v) => set("fullName", v)} autoComplete="name" />
        <Field
          name="email"
          label="Email address"
          type="email"
          value={form.email}
          error={e.email}
          onChange={(v) => set("email", v)}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
        />
        <Field
          name="phone"
          label="Mobile phone number"
          hint="We’ll text and call this number during a freeze."
          type="tel"
          value={form.phone}
          error={e.phone}
          onChange={(v) => set("phone", v)}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="(713) 555-0123"
        />
        <Choice
          name="language"
          label="Which language should we use?"
          options={[
            { value: "en", label: "English" },
            { value: "es", label: "Español" },
          ]}
          value={form.language}
          onChange={(v) => set("language", v || "en")}
        />
      </Section>

      <Section title="Your home" note="So we can match you to your home and your street’s water plan.">
        <Field
          name="addressLine1"
          label="Street address"
          value={form.addressLine1}
          error={e.addressLine1}
          onChange={(v) => set("addressLine1", v)}
          autoComplete="address-line1"
          placeholder="1234 E 27th St"
        />
        <Field
          name="addressLine2"
          label="Apartment or unit"
          optional
          value={form.addressLine2}
          error={e.addressLine2}
          onChange={(v) => set("addressLine2", v)}
          autoComplete="address-line2"
        />
        <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_7rem_8rem]">
          <div className="col-span-2 sm:col-span-1">
            <Field name="city" label="City" value={form.city} error={e.city} onChange={(v) => set("city", v)} autoComplete="address-level2" />
          </div>
          <div>
            <p className="block text-sm font-medium">State</p>
            <p className="mt-1.5 rounded-md border border-border bg-bg px-3 py-2.5 text-base text-muted">TX</p>
          </div>
          <Field
            name="zip"
            label="ZIP code"
            value={form.zip}
            error={e.zip}
            onChange={(v) => set("zip", v)}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </div>
      </Section>

      <Section title="Emergency contact" note="Optional. Who can we call if we can’t reach you?">
        <Field
          name="emergencyName"
          label="Their name"
          value={form.emergencyName}
          error={e.emergencyName}
          onChange={(v) => set("emergencyName", v)}
          autoComplete="off"
        />
        <Field
          name="emergencyPhone"
          label="Their phone number"
          type="tel"
          value={form.emergencyPhone}
          error={e.emergencyPhone}
          onChange={(v) => set("emergencyPhone", v)}
          autoComplete="off"
          inputMode="tel"
        />
      </Section>

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(ev) => set("website", ev.target.value)} />
        </label>
      </div>

      <div data-field="consent" className="rounded-panel border border-border bg-surface p-5 sm:p-6">
        <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3">
          <input
            id={consentId}
            type="checkbox"
            checked={form.consent}
            onChange={(ev) => set("consent", ev.target.checked)}
            aria-invalid={e.consent ? true : undefined}
            aria-describedby={e.consent ? `${consentId}-err` : undefined}
            className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm leading-relaxed">{CONSENT_TEXT}</span>
        </label>
        <ErrorText id={`${consentId}-err`} text={e.consent} />
      </div>

      {message && (
        <p role="alert" className="rounded-md border border-danger/40 px-4 py-3 text-sm text-danger">
          {message}
        </p>
      )}
      {Object.values(errors).some(Boolean) && (
        <p role="alert" className="text-sm text-danger">
          Please fix the highlighted {Object.values(errors).filter(Boolean).length === 1 ? "answer" : "answers"} above.
        </p>
      )}

      <button type="submit" disabled={sending} className="btn btn-primary w-full !min-h-12 !text-base">
        {sending ? "Signing you up…" : "Sign up"}
      </button>
      <p className="pb-6 text-center text-sm text-muted">We only use your details to reach you about freezes and your water service.</p>
    </form>
  );
}
