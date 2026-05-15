export type LabWorldCard = {
  id: string;
  title: string;
  label: string;
  href: string;
  color: string;
  position: [number, number, number];
};

export const labWorldCards: LabWorldCard[] = [
  {
    id: "writing",
    title: "Writing",
    label: "Posts, notes, and retrospectives",
    href: "/",
    color: "#2dd4bf",
    position: [-3.0, 0.5, -1.2],
  },
  {
    id: "projects",
    title: "Projects",
    label: "Current builds and experiments",
    href: "/tags/projects",
    color: "#f59e0b",
    position: [-1.7, -0.4, 0.7],
  },
  {
    id: "prompts",
    title: "Prompts",
    label: "Captured workflows and review",
    href: "/admin/prompts",
    color: "#a78bfa",
    position: [0.4, 0.4, -0.2],
  },
  {
    id: "todos",
    title: "TODO",
    label: "Local planning surface",
    href: "/todos",
    color: "#60a5fa",
    position: [2.3, -0.2, 0.8],
  },
  {
    id: "profile",
    title: "Profile",
    label: "Identity and archive",
    href: "/profile/me",
    color: "#fb7185",
    position: [3.1, 0.7, -1.2],
  },
];

export function nextCardId(currentId: string, direction: 1 | -1) {
  const index = labWorldCards.findIndex((card) => card.id === currentId);
  const nextIndex =
    index === -1
      ? 0
      : (index + direction + labWorldCards.length) % labWorldCards.length;

  return labWorldCards[nextIndex].id;
}
