"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./pricing.module.css";

const FORMSPREE_ID = "xbdbjkkg";
const FORMSPREE_URL = `https://formspree.io/f/${FORMSPREE_ID}`;
const TIMEOUT_MS = 10_000;

type FormState = "idle" | "submitting" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm() {
  const [state, setState] = useState<FormState>("idle");
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState("");
  const successRef = useRef<HTMLParagraphElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed || !EMAIL_RE.test(trimmed)) {
      setValidationError("Enter a valid email address.");
      return;
    }

    setValidationError("");
    setState("submitting");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: trimmed,
          _gotcha: "",
          _source: "pricing-card",
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        setState("error");
        return;
      }

      setState("success");
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      clearTimeout(timer);
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <p
        ref={successRef}
        className={styles.waitlistSuccess}
        aria-live="polite"
        tabIndex={-1}
      >
        ✓ You're on the list. We'll reach out when Team is ready.
      </p>
    );
  }

  return (
    <form
      className={styles.waitlistForm}
      onSubmit={handleSubmit}
      noValidate
    >
      {/* Honeypot — off-screen, invisible to real users */}
      <div className={styles.waitlistHoneypot} aria-hidden="true">
        <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="_source" value="pricing-card" />

      <input
        type="email"
        name="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (validationError) setValidationError("");
        }}
        placeholder="you@company.com"
        aria-label="Email address"
        className={styles.waitlistInput}
        disabled={state === "submitting"}
        autoComplete="email"
      />

      <Button
        variant="primary"
        size="md"
        type="submit"
        disabled={state === "submitting"}
        className="w-full justify-center sm:w-auto shrink-0"
      >
        {state === "submitting" ? "Sending..." : "Join the waitlist"}
      </Button>

      <div aria-live="polite" className={styles.waitlistMessage}>
        {validationError && (
          <p className={styles.waitlistError}>{validationError}</p>
        )}
        {state === "error" && (
          <p className={styles.waitlistError}>
            Something went wrong. Email us at{" "}
            <a href="mailto:team@anatomia.dev">team@anatomia.dev</a> instead.
          </p>
        )}
      </div>
    </form>
  );
}
