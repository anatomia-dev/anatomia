import type { ProofAttestation, ProofVerdictVeto } from "@/lib/docs-data/types";

interface SessionAttestationProps {
  attestation?: ProofAttestation;
  verdictVeto?: ProofVerdictVeto;
  className?: string;
}

/** Abbreviate a `sha256:…`-prefixed hash for compact display. */
function shortHash(hash: string): string {
  if (!hash) return "—";
  return hash.length > 17 ? `${hash.slice(0, 17)}…` : hash;
}

/**
 * Session Attestation — the coverage-aware behavioral verdicts, in the
 * AssertionLedger structure but with DIVERGED color semantics. `unverifiable` is
 * a neutral abstention (muted ink), never the ledger&apos;s red gating fail;
 * `satisfied` is restrained (info, not the bright pass green) so a 1/49 count
 * cannot inflate into false confidence; `violated` is the ONLY alarm state.
 * These verdicts are evidence, never gating — except the nested read-build-report
 * veto, whose applied branch merely renders an outcome decided upstream.
 */
export function SessionAttestation({ attestation, verdictVeto, className }: SessionAttestationProps) {
  if (!attestation && !verdictVeto) return null;

  const rowLabel: React.CSSProperties = { color: "var(--ink-80)", fontWeight: 600 };
  const muted: React.CSSProperties = { color: "var(--ink-45)" };

  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "14px 18px",
        background: "var(--bg-card)",
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
        marginTop: "14px",
      }}
    >
      {attestation && (
        <>
          <div style={{ color: "var(--ink-60)", marginBottom: "12px" }}>
            <span style={muted}>core</span> v{attestation.coreVersion || "?"}{" "}
            <span style={muted}>· framework</span> {attestation.framework || "?"}
          </div>

          {attestation.agents.map((agent, i) => (
            <div
              key={`${agent.label}-${i}`}
              style={{
                paddingTop: i > 0 ? "12px" : 0,
                marginTop: i > 0 ? "12px" : 0,
                borderTop: i > 0 ? "1px solid var(--hairline)" : undefined,
              }}
            >
              <div style={{ marginBottom: "4px" }}>
                <span style={rowLabel}>{agent.label}</span>{" "}
                <span style={muted}>· {agent.coverage.total} claims</span>
              </div>

              <div style={{ marginBottom: "4px" }}>
                <span style={{ color: "var(--info)" }}>{agent.satisfied} satisfied</span>
                <span style={muted}> · </span>
                <span
                  style={{
                    color: agent.violated > 0 ? "var(--fail)" : "var(--ink-45)",
                    fontWeight: agent.violated > 0 ? 600 : 400,
                  }}
                >
                  {agent.violated} violated
                </span>
                <span style={muted}> · </span>
                <span style={muted}>{agent.unverifiable} unverifiable</span>
              </div>

              {/* Coverage ratio — the prominent, honest headline figure. */}
              <div
                style={{
                  color: "var(--ink-60)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  margin: "6px 0",
                }}
              >
                coverage {agent.coverage.checked}/{agent.coverage.total} checked
                <span style={{ ...muted, fontWeight: 400 }}>
                  {" "}
                  · {agent.coverage.unverifiable} unverifiable
                </span>
              </div>

              {agent.notable.map((v, j) => (
                <div key={`${v.claimId}-${j}`} style={{ ...muted, paddingLeft: "12px" }}>
                  <span style={{ color: v.status === "violated" ? "var(--fail)" : "var(--warn)" }}>
                    ⚠
                  </span>{" "}
                  {v.claimId} {v.status} ({v.reason})
                </div>
              ))}

              <div style={{ ...muted, marginTop: "4px" }}>
                mandate {shortHash(agent.mandateHash)} · transcript {shortHash(agent.transcriptHash)}
              </div>

              {!agent.complete && (
                <div style={{ color: "var(--warn)", marginTop: "4px" }}>⚠ incomplete coverage</div>
              )}
            </div>
          ))}
        </>
      )}

      {verdictVeto && (
        <div
          style={{
            marginTop: attestation ? "14px" : 0,
            paddingTop: attestation ? "12px" : 0,
            borderTop: attestation ? "1px solid var(--hairline)" : undefined,
          }}
        >
          {verdictVeto.applied ? (
            <div
              style={{
                border: "1px solid var(--fail)",
                background: "var(--fail-bg)",
                borderRadius: "var(--r-md)",
                padding: "10px 12px",
                color: "var(--fail)",
                fontWeight: 600,
              }}
            >
              ⛔ verdict veto: APPLIED —{" "}
              {verdictVeto.reason || "verify read build_report.md"}{" "}
              <span style={{ fontWeight: 400 }}>(forward-only)</span>
            </div>
          ) : (
            <div style={{ color: "var(--ink-60)" }}>
              verdict veto: not applied — {verdictVeto.reason || "no captured transcript"}
            </div>
          )}
          <div style={{ ...muted, marginTop: "6px" }}>
            veto is forward-only; pre-veto verdicts were self-reported.
          </div>
        </div>
      )}
    </div>
  );
}
