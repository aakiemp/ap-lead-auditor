import { cloneElement, isValidElement, type ReactElement } from "react";

interface FieldElementProps {
  id?: string;
  name?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Wraps a single form control with a label, optional description, and
 * optional validation error, wiring up id/aria-describedby/aria-invalid
 * correctly rather than leaving each page to hand-roll it. The input
 * itself is passed as `children` and cloned only to inject those four
 * attributes -- everything else about it (type, value, onChange, ...)
 * stays exactly as the caller wrote it.
 */
export function FormField({
  label,
  name,
  error,
  description,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: ReactElement<FieldElementProps>;
}) {
  const errorId = error ? `${name}-error` : undefined;
  const descriptionId = description ? `${name}-description` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const field = isValidElement(children)
    ? cloneElement(children, {
        id: name,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-zinc-700">
        {label}
        {required ? " *" : ""}
      </label>
      {description ? (
        <p id={descriptionId} className="mt-0.5 text-xs text-zinc-500">
          {description}
        </p>
      ) : null}
      <div className="mt-1">{field}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
