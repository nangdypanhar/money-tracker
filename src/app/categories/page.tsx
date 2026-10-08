"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormDrawer, useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { CATEGORY_ICONS, CategoryIcon, paletteColor } from "@/components/finance/category-icon";
import { InfoRow, Panel, Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData } from "@/features/data/data-provider";
import { categoriesRepo } from "@/lib/db/repositories";
import { FEES_CATEGORY_ID } from "@/lib/db/seed";
import type { Category, CategoryKind } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export default function CategoriesPage() {
  const { data } = useData();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const categories = data.categories.filter((c) => c.kind === kind);

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader
        title="Categories"
        back
        className="px-0"
        action={
          <button type="button" aria-label="Add category" onClick={() => setEditing("new")} className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Plus className="size-5" />
          </button>
        }
      />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "expense", label: "Expenses" },
          { value: "income", label: "Income" },
        ]}
      />
      <Panel className="p-2">
        <ul className="flex flex-col">
          {categories.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-accent/60">
                <span className="grid size-10 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${paletteColor(c.color)} 22%, transparent)`, color: paletteColor(c.color) }}>
                  <CategoryIcon name={c.icon} className="size-4" />
                </span>
                <span className="text-sm">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <FormDrawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "New category" : "Edit category"}>
        {editing !== null && (
          <CategoryForm key={editing === "new" ? "new" : editing.id} category={editing === "new" ? null : editing} kind={kind} onDone={() => setEditing(null)} />
        )}
      </FormDrawer>
    </main>
  );
}

function CategoryForm({ category, kind, onDone }: { category: Category | null; kind: CategoryKind; onDone: () => void }) {
  const { data, refresh } = useData();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? 0);
  const [icon, setIcon] = useState(category?.icon ?? "ellipsis");
  const used =
    !!category &&
    (data.transactions.some((t) => "categoryId" in t && t.categoryId === category.id) ||
      data.budgets.some((b) => b.categoryIds.includes(category.id)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name the category.");
    if (category) await categoriesRepo.update({ ...category, name: name.trim(), color, icon });
    else await categoriesRepo.create({ name: name.trim(), kind, color, icon });
    await refresh();
    onDone();
  }

  async function remove() {
    if (!category || !(await confirm("Delete this category?", "It isn't used by any transaction or budget."))) return;
    await categoriesRepo.softDelete(category.id);
    await refresh();
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Field label="Name" htmlFor="cat-name">
        <Input id="cat-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
      </Field>
      <Field label="Color">
        <div className="flex gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Color ${i + 1}`}
              aria-pressed={color === i}
              onClick={() => setColor(i)}
              className={cn("size-9 rounded-full ring-offset-2 ring-offset-card", color === i && "ring-2 ring-foreground")}
              style={{ background: paletteColor(i) }}
            />
          ))}
        </div>
      </Field>
      <Field label="Icon">
        <div className="grid grid-cols-6 gap-2">
          {Object.keys(CATEGORY_ICONS).map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={icon === key}
              onClick={() => setIcon(key)}
              className={cn("grid aspect-square place-items-center rounded-xl border", icon === key ? "border-ring bg-primary/25" : "bg-background/40")}
            >
              <CategoryIcon name={key} className="size-4" />
            </button>
          ))}
        </div>
      </Field>
      <Button type="submit" className="h-12 rounded-full text-base">
        {category ? "Save" : "Add category"}
      </Button>
      {category && category.id !== FEES_CATEGORY_ID && !used && (
        <Button type="button" variant="ghost" className="h-11 rounded-full text-expense" onClick={remove}>
          Delete category
        </Button>
      )}
      {category && used && <InfoRow>This category is in use, so it can be renamed but not deleted.</InfoRow>}
      {dialog}
    </form>
  );
}
