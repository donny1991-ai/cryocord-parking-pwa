import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IdentityDocumentRow } from "./identity-document-row";

describe("IdentityDocumentRow", () => {
  it("masks an NRIC until the reveal button is pressed", async () => {
    const user = userEvent.setup();

    render(<IdentityDocumentRow identityType="nric" nric="900101-14-1234" />);

    expect(screen.getByText("NRIC")).toBeInTheDocument();
    expect(screen.getByText("******-**-1234")).toBeInTheDocument();
    expect(screen.queryByText("900101-14-1234")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reveal NRIC" }));

    expect(screen.getByText("900101-14-1234")).toBeInTheDocument();
    expect(screen.queryByText("******-**-1234")).not.toBeInTheDocument();
  });

  it("masks a passport number until the reveal button is pressed", async () => {
    const user = userEvent.setup();

    render(<IdentityDocumentRow identityType="passport" passportNumber="A1234567" />);

    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.getByText("****4567")).toBeInTheDocument();
    expect(screen.queryByText("A1234567")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reveal Passport" }));

    expect(screen.getByText("A1234567")).toBeInTheDocument();
  });
});
