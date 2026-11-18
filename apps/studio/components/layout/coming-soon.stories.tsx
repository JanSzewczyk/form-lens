import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { ComingSoon } from "./coming-soon";

const meta = preview.meta({
  args: {
    description: "Tracking extraction jobs is not available yet.",
    section: "Jobs"
  },
  component: ComingSoon,
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-7 p-8">
        <Story />
      </div>
    )
  ],
  parameters: { layout: "fullscreen" },
  title: "Components/Layout/Coming Soon"
});

export const JobsPlaceholder = meta.story({ name: "Jobs placeholder" });

JobsPlaceholder.test("Names the section and says it is coming soon", async ({ canvas }) => {
  await expect(canvas.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect(canvas.getByText("Coming soon")).toBeVisible();
  await expect(canvas.getByText("Tracking extraction jobs is not available yet.")).toBeVisible();
});
