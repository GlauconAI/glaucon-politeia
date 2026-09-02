import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";
import { PROJECT_VERSION_STATUS_LABELS } from "@/lib/observatory/project-versions";

type ProjectVersionPickerProps = {
  id: string;
  versions: ObservatoryProjectVersionRow[];
  projectKey: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  allowAll?: boolean;
};

export function ProjectVersionPicker({
  id,
  versions,
  projectKey,
  value,
  onChange,
  name = "projectVersionId",
  required = false,
  allowAll = false,
}: ProjectVersionPickerProps) {
  const available = versions.filter(
    (version) => version.project_key === projectKey && (allowAll || version.status !== "archived"),
  );
  const selectedAvailable = available.some((version) => version.id === value);
  return (
    <label className="observatory-field work-tracker-version-picker" htmlFor={id}>
      <span>Project Version</span>
      <select
        id={id}
        name={name}
        value={value}
        required={required}
        disabled={!projectKey || projectKey === "all"}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{projectKey && projectKey !== "all" ? "Choose a version" : "Choose a Project first"}</option>
        {allowAll ? <option value="all">全部版本</option> : null}
        {value && value !== "all" && !selectedAvailable ? (
          <option value={value}>Current version</option>
        ) : null}
        {available.map((version) => (
          <option key={version.id} value={version.id}>
            {version.is_backlog ? "待规划" : version.version_label} · {PROJECT_VERSION_STATUS_LABELS[version.status]}
          </option>
        ))}
      </select>
    </label>
  );
}
