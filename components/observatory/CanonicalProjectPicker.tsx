"use client";

import { useMemo, useState } from "react";

import {
  matchesWorkTrackerProject,
  type WorkTrackerProjectOption,
} from "@/lib/observatory/work-tracker-projects";

type CanonicalProjectPickerProps = {
  id: string;
  projects: WorkTrackerProjectOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  allowAll?: boolean;
  required?: boolean;
  disabled?: boolean;
  searchLabel?: string;
  selectLabel?: string;
  allLabel?: string;
  emptyLabel?: string;
  showAvailabilityCount?: boolean;
};

export function CanonicalProjectPicker({
  id,
  projects,
  value,
  onChange,
  name = "projectRef",
  allowAll = false,
  required = false,
  disabled = false,
  searchLabel = "Search Project",
  selectLabel = "Project",
  allLabel = "All Projects",
  emptyLabel = "Choose a Project",
  showAvailabilityCount = true,
}: CanonicalProjectPickerProps) {
  const [query, setQuery] = useState("");
  const selected = projects.find((project) => project.projectKey === value);
  const visibleProjects = useMemo(() => {
    const matches = projects.filter((project) =>
      matchesWorkTrackerProject(project, query),
    );
    if (!selected || matches.some((project) => project.projectKey === value)) {
      return matches;
    }
    return [selected, ...matches];
  }, [projects, query, selected, value]);
  const registryUnavailable = projects.length === 0;
  const controlsDisabled = disabled || registryUnavailable;
  const helpId = `${id}-project-help`;

  return (
    <div className="work-tracker-project-picker">
      <label htmlFor={`${id}-search`}>
        <span>{searchLabel}</span>
        <input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, key, owner, or status…"
          disabled={controlsDisabled}
        />
      </label>
      <label htmlFor={id}>
        <span>{selectLabel}</span>
        <select
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={controlsDisabled}
          aria-describedby={registryUnavailable ? helpId : undefined}
        >
          {allowAll ? (
            <option value="all">{allLabel}</option>
          ) : (
            <option value="">{emptyLabel}</option>
          )}
          {visibleProjects.map((project) => (
            <option key={project.projectKey} value={project.projectKey}>
              {project.title} · {project.owner} · {project.status}
            </option>
          ))}
        </select>
      </label>
      {registryUnavailable ? (
        <p id={helpId} role="alert" className="work-tracker-project-picker-error">
          Project registry is unavailable. Project changes are disabled.
        </p>
      ) : showAvailabilityCount ? (
        <small>{visibleProjects.length} Projects available</small>
      ) : null}
    </div>
  );
}
