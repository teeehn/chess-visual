import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home", () => {
  it("renders the heading and upload prompt", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Chess Game Visualizer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Click to upload")).toBeInTheDocument();
  });
});
