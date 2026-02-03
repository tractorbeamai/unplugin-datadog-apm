import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>TanStack Start + Datadog APM Example</h1>
      <p>
        This example demonstrates using <code>unplugin-datadog-apm</code> with:
      </p>
      <ul>
        <li>Vite 8</li>
        <li>Nitro (nightly)</li>
        <li>TanStack Start</li>
      </ul>
      <h2>Setup</h2>
      <ol>
        <li>
          Set your Datadog environment variables:
          <pre
            style={{
              background: "#f4f4f4",
              padding: "1rem",
              borderRadius: "4px",
            }}
          >
            {`DD_SERVICE=my-app
DD_ENV=development
DD_TRACE_ENABLED=true
DD_TRACE_DEBUG=true  # optional`}
          </pre>
        </li>
        <li>
          Run <code>pnpm dev</code> for development
        </li>
        <li>
          Run <code>pnpm build && pnpm start</code> for production
        </li>
      </ol>
    </div>
  );
}
