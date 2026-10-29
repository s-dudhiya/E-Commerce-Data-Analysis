import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FiltersProvider } from "@/context/FiltersContext";
import App from "@/App";

describe("App routing", () => {
  it("renders with react-router-dom cleanly", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <FiltersProvider>
          <MemoryRouter initialEntries={["/"]}>
            <App />
          </MemoryRouter>
        </FiltersProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Connecting to MarketLens Warehouse|MarketLens/)).toBeDefined();
  });
});
