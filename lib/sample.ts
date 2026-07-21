import type { Story } from "./scheduler";

export const sampleStories: Story[] = [
  { id: "PLAT-101", title: "Confirm identity event contract", points: 3, status: "In Progress", team: "Platform", assignee: "Worker 1", sprint: "Sprint 24" },
  { id: "DATA-204", title: "Backfill customer identity graph", points: 8, status: "To Do", team: "Data", links: [{ type: "depends on", storyId: "PLAT-101" }] },
  { id: "API-118", title: "Expose unified customer profile", points: 5, status: "To Do", team: "Platform", links: [{ type: "depends on", storyId: "DATA-204" }] },
  { id: "WEB-311", title: "Build profile merge review", points: 8, status: "To Do", team: "Experience", links: [{ type: "depends on", storyId: "API-118" }] },
  { id: "OPS-77", title: "Add graph freshness monitors", points: 3, status: "To Do", team: "Reliability", links: [{ type: "is depended on by", storyId: "DATA-204" }] },
  { id: "SEC-52", title: "Threat model profile merge", points: 5, status: "Review", team: "Security", links: [{ type: "depends on", storyId: "PLAT-101" }] },
  { id: "API-126", title: "Add merge authorization checks", points: 5, status: "To Do", team: "Platform", dependsOn: ["SEC-52"] },
  { id: "WEB-320", title: "Instrument merge funnel", points: 3, status: "To Do", team: "Experience", dependsOn: ["WEB-311", "API-126"] },
  { id: "DOC-19", title: "Publish support runbook", points: 2, status: "To Do", team: "Enablement", dependsOn: ["WEB-320"] },
  { id: "PLAT-88", title: "Provision identity topic", points: 3, status: "Done", team: "Platform" },
  { id: "WEB-199", title: "Retired profile prototype", points: 5, status: "Canceled", team: "Experience" },
];
