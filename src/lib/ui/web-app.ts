export function buildWebUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SYNX Web UI</title>
    <style>
      :root {
        --bg: #f4f6f8;
        --fg: #12202f;
        --accent: #0a7a5a;
        --card: #ffffff;
        --muted: #4e6278;
      }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
        background: radial-gradient(circle at 10% 10%, #e6f6f0 0%, var(--bg) 55%);
        color: var(--fg);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .card {
        background: var(--card);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 8px 24px rgba(17, 32, 52, 0.08);
        margin-bottom: 16px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      p {
        margin: 0;
        color: var(--muted);
      }
      code {
        background: #edf2f7;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>SYNX Web UI</h1>
        <p>Read-only API is running. Phase 1 dashboard will render here.</p>
      </section>
      <section class="card">
        <p>Try <code>/api/overview</code>, <code>/api/tasks</code>, <code>/api/review-queue</code>.</p>
      </section>
    </main>
  </body>
</html>`;
}
