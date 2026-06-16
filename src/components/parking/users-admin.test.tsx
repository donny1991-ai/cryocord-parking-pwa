import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersAdmin } from "./users-admin";

describe("UsersAdmin", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens the create form ready to submit once required fields are filled", () => {
    render(<UsersAdmin users={[]} actorId="actor-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(screen.getByRole("button", { name: "Create user" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Saving/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Guard" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Admin" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Supervisor" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: "Khal" } });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "khalili.kamal@cryocord.com.my" },
    });

    expect(screen.getByRole("button", { name: "Create user" })).not.toBeDisabled();
  });

  it("recovers from a hung save request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_path: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }),
    );

    render(<UsersAdmin users={[]} actorId="actor-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByRole("heading", { name: "Create user" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: "Khal" } });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: "khalili.kamal@cryocord.com.my" },
    });

    vi.useFakeTimers();
    const form = screen.getByRole("heading", { name: "Create user" }).closest("form");
    expect(form).toBeDefined();
    fireEvent.submit(form!);

    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    vi.useRealTimers();

    expect(screen.getByText("Request timed out. Please check the server connection and try again.")).toBeInTheDocument();
    expect(within(form!).getByRole("button", { name: "Create user" })).not.toBeDisabled();
  });
});
