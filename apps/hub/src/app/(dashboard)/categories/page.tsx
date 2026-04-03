'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, ApiClientError } from '@/lib/api';
import { CategoryForm, type Category } from '@/components/category-form';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

interface SortableRowProps {
  category: Category;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
}

function SortableRow({ category, onEdit, onDelete }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      {/* Drag handle */}
      <TableCell className="w-10">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      {/* Colour swatch */}
      <TableCell className="w-12">
        <span
          className="inline-block h-5 w-5 rounded-full border"
          style={{ backgroundColor: category.colour || '#94a3b8' }}
        />
      </TableCell>

      {/* Icon */}
      <TableCell className="w-12 text-center text-lg">{category.icon || '—'}</TableCell>

      {/* Name */}
      <TableCell>
        <span
          className="cursor-pointer font-medium hover:underline"
          onClick={() => onEdit(category)}
        >
          {category.name}
        </span>
      </TableCell>

      {/* Product count */}
      <TableCell className="text-sm text-muted-foreground">
        {category.productCount ?? 0} products
      </TableCell>

      {/* Sort position */}
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        #{category.sortOrder}
      </TableCell>

      {/* Actions */}
      <TableCell className="w-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(category)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(category)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Category[] | { data: Category[] }>('/categories');
      const list = Array.isArray(res) ? res : res.data;
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(list);
    } catch {
      toast.error('Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleCreate() {
    setEditCategory(null);
    setFormOpen(true);
  }

  function handleEdit(cat: Category) {
    setEditCategory(cat);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/categories/${deleteTarget.id}`);
      toast.success(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      fetchCategories();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to delete category.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sortOrder: i + 1,
    }));

    // Optimistic update
    setCategories(reordered);

    try {
      await api.patch('/categories/reorder', {
        items: reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
      });
      toast.success('Order updated.');
    } catch {
      // Revert
      fetchCategories();
      toast.error('Failed to save order.');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organise your menu with categories. Drag to reorder.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-12">Colour</TableHead>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!loading && categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <p className="text-sm">
                        No categories yet. Add your first category to organise your menu.
                      </p>
                      <Button size="sm" variant="outline" onClick={handleCreate}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Category
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading && categories.length > 0 && (
                <SortableContext
                  items={categories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map((cat) => (
                    <SortableRow
                      key={cat.id}
                      category={cat}
                      onEdit={handleEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>

      {/* Create / Edit form */}
      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editCategory}
        onSaved={fetchCategories}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              {deleteTarget && (deleteTarget.productCount ?? 0) > 0 ? (
                <>
                  <strong className="text-destructive">Warning:</strong> &quot;{deleteTarget.name}
                  &quot; has {deleteTarget.productCount} product
                  {deleteTarget.productCount === 1 ? '' : 's'} assigned. Deleting this category will
                  leave those products uncategorised.
                </>
              ) : (
                <>
                  Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action
                  cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
