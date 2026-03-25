import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 40,
        color: "var(--fg)",
      }}>
        <span style={{ fontSize: 28 }}>⚠</span>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>
            {this.props.label ?? "This panel"} crashed
          </p>
          <p style={{
            fontSize: 12, color: "var(--muted)",
            fontFamily: "var(--mono)",
            maxWidth: 480, wordBreak: "break-word",
          }}>
            {error.message}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            background: "var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "6px 16px",
            color: "var(--fg)", fontSize: 12, cursor: "pointer",
            fontFamily: "var(--font)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }
}
