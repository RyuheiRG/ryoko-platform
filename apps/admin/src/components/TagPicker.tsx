import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";
import { dataSchema, type Tag, tagSchema } from "../lib/schemas";

const tagsSchema = dataSchema(tagSchema.array());

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const body = await api.get<unknown>("/v1/admin/tags");
      return tagsSchema.parse(body).data;
    },
  });
}

export function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const query = useTags();

  const toggle = (tag: Tag) => {
    if (selected.includes(tag.id)) {
      onChange(selected.filter((id) => id !== tag.id));
    } else {
      onChange([...selected, tag.id]);
    }
  };

  if (query.isLoading) {
    return <p className="text-sm text-muted">Cargando tags…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-bright">No se pudieron cargar los tags.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 border border-line bg-ink p-3 sm:grid-cols-3">
      {(query.data ?? []).map((tag) => (
        <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm text-bone">
          <input
            type="checkbox"
            checked={selected.includes(tag.id)}
            onChange={() => toggle(tag)}
            className="h-4 w-4 accent-[var(--color-red)]"
          />
          <span className="font-mono text-xs uppercase tracking-[0.04em]">{tag.name}</span>
        </label>
      ))}
    </div>
  );
}
