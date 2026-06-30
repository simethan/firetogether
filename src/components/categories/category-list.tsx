"use client";

import { useState } from "react";
import type { Category } from "@/lib/types";
import { CategoryIcon } from "@/components/categories/category-icon";
import { IconPicker } from "@/components/categories/icon-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/app/categories/actions";
import { Pencil, Trash2, Plus } from "lucide-react";

type CategoryListProps = {
  categories: Category[];
};

export function CategoryList({ categories }: CategoryListProps) {
  const defaultCategories = categories.filter((c) => c.is_default);
  const customCategories = categories.filter((c) => !c.is_default);

  return (
    <div className="space-y-6">
      {defaultCategories.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Default categories
          </h3>
          <div className="space-y-1">
            {defaultCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </div>
        </div>
      )}

      {customCategories.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Custom categories
          </h3>
          <div className="space-y-1">
            {customCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </div>
        </div>
      )}

      {categories.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No categories yet. Create one below.
        </p>
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <CategoryIcon icon={category.icon} className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm font-medium">{category.name}</span>
      <Badge variant={category.is_default ? "secondary" : "outline"} className="text-xs">
        {category.is_default ? "Default" : "Custom"}
      </Badge>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <EditCategoryDialog category={category} />
        {!category.is_default && <DeleteCategoryDialog category={category} />}
      </div>
    </div>
  );
}

function EditCategoryDialog({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState(category.icon ?? "");

  async function handleSubmit(formData: FormData) {
    await updateCategoryAction(formData);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center justify-center rounded-lg h-8 w-8 hover:bg-muted hover:text-foreground transition-colors outline-none"
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
          <DialogDescription>
            Update the name or icon for &ldquo;{category.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-2">
          <input type="hidden" name="id" value={category.id} />
          <div className="space-y-2">
            <Label htmlFor={`edit-name-${category.id}`}>Name</Label>
            <Input
              id={`edit-name-${category.id}`}
              name="name"
              defaultValue={category.name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-icon-${category.id}`}>Icon</Label>
            <input type="hidden" name="icon" value={icon} />
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <DialogFooter>
            <DialogClose
              className="inline-flex items-center justify-center rounded-lg h-8 px-2.5 text-sm font-medium border border-border bg-background hover:bg-muted hover:text-foreground transition-colors outline-none"
            >
              Cancel
            </DialogClose>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(formData: FormData) {
    await deleteCategoryAction(formData);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center justify-center rounded-lg h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors outline-none"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete category</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{category.name}&rdquo;? This cannot be undone.
            Categories that are used by expenses cannot be deleted.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="pt-2">
          <input type="hidden" name="id" value={category.id} />
          <DialogFooter>
            <DialogClose
              className="inline-flex items-center justify-center rounded-lg h-8 px-2.5 text-sm font-medium border border-border bg-background hover:bg-muted hover:text-foreground transition-colors outline-none"
            >
              Cancel
            </DialogClose>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCategoryForm() {
  return (
    <form action={createCategoryAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="new-category-name" className="text-xs font-medium text-muted-foreground">
            Name
          </Label>
          <Input
            id="new-category-name"
            name="name"
            placeholder="Date nights"
            required
            className="h-10"
          />
        </div>
        <Button type="submit" className="h-10 shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Icon
        </Label>
        <CategoryIconField />
      </div>
    </form>
  );
}

function CategoryIconField() {
  const [icon, setIcon] = useState("");

  return (
    <div className="space-y-2">
      <input type="hidden" name="icon" value={icon} />
      <IconPicker value={icon} onChange={setIcon} />
      {icon && (
        <p className="text-xs text-muted-foreground">
          Selected: <CategoryIcon icon={icon} className="inline h-3.5 w-3.5 align-text-bottom" /> {icon}
        </p>
      )}
    </div>
  );
}
