import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { type Media, mediaSchema, pageSchema } from "../lib/schemas";
import { Field, Select } from "./ui";

const mediaPageSchema = pageSchema(mediaSchema);

export function useMediaOptions() {
  return useQuery({
    queryKey: ["media", "picker"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/media?limit=100");
      return mediaPageSchema.parse(body).data;
    },
  });
}

export function MediaPicker({
  label = "Media",
  value,
  onChange,
  hint,
}: {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
}) {
  const query = useMediaOptions();
  const items: Media[] = query.data ?? [];
  const selected = items.find((item) => item.id === value);

  return (
    <div className="space-y-2">
      <Field label={label} hint={hint ?? "Sube archivos desde la sección Media."}>
        <Select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">Sin imagen</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.alt || item.url.split("/").pop() || item.id}
            </option>
          ))}
        </Select>
      </Field>
      {selected ? (
        <img
          src={selected.url}
          alt={selected.alt}
          className="h-20 w-32 border border-line object-cover"
        />
      ) : null}
    </div>
  );
}
