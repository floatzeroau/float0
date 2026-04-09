'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  ChevronDown,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  ModifierGroupForm,
  type ModifierGroup,
  type Modifier,
} from '@/components/modifier-group-form';
import { ModifierForm } from '@/components/modifier-form';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(dollars: number): string {
  if (dollars === 0) return '$0.00';
  const abs = Math.abs(dollars);
  const str = `$${abs.toFixed(2)}`;
  return dollars > 0 ? `+${str}` : `-${str}`;
}

function selectionLabel(group: ModifierGroup): string {
  if (group.selectionType === 'single') {
    if (group.minSelections === group.maxSelections) {
      return `Required, pick ${group.minSelections}`;
    }
    return `Required, ${group.minSelections}–${group.maxSelections}`;
  }
  return `Optional, up to ${group.maxSelections}`;
}

// ---------------------------------------------------------------------------
// Sortable modifier row
// ---------------------------------------------------------------------------

interface SortableModifierRowProps {
  modifier: Modifier;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDefault: () => void;
}

function SortableModifierRow({
  modifier,
  onEdit,
  onDelete,
  onToggleDefault,
}: SortableModifierRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: modifier.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="flex-1 text-sm font-medium">{modifier.name}</span>

      <span
        className={cn(
          'text-sm font-mono tabular-nums',
          modifier.priceAdjustment > 0
            ? 'text-green-600'
            : modifier.priceAdjustment < 0
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
      >
        {formatPrice(modifier.priceAdjustment)}
      </span>

      <div className="flex items-center gap-1.5">
        <Switch
          checked={modifier.isDefault}
          onCheckedChange={onToggleDefault}
          aria-label="Default selection"
        />
        <span className="text-xs text-muted-foreground w-12">
          {modifier.isDefault ? 'Default' : ''}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Per-group modifiers loaded on expand
  const [groupModifiers, setGroupModifiers] = useState<Record<string, Modifier[]>>({});
  const [loadingModifiers, setLoadingModifiers] = useState<Set<string>>(new Set());

  // Dialogs
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ModifierGroup | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ModifierGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [modFormOpen, setModFormOpen] = useState(false);
  const [editModifier, setEditModifier] = useState<Modifier | null>(null);
  const [modGroupId, setModGroupId] = useState('');
  const [deleteModTarget, setDeleteModTarget] = useState<Modifier | null>(null);
  const [deleteModGroupId, setDeleteModGroupId] = useState('');
  const [deletingMod, setDeletingMod] = useState(false);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // -------------------------------------------------------------------------
  // Fetch groups (list only — no modifiers array)
  // -------------------------------------------------------------------------

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ModifierGroup[] | { data: ModifierGroup[] }>('/modifier-groups');
      const list = Array.isArray(res) ? res : res.data;
      setGroups(list);
    } catch {
      toast.error('Failed to load modifier groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // -------------------------------------------------------------------------
  // Fetch modifiers for a specific group
  // -------------------------------------------------------------------------

  const fetchGroupModifiers = useCallback(async (groupId: string) => {
    setLoadingModifiers((prev) => new Set(prev).add(groupId));
    try {
      const res = await api.get<Modifier[] | { data: Modifier[] }>(
        `/modifier-groups/${groupId}/modifiers`,
      );
      const list = Array.isArray(res) ? res : res.data;
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      setGroupModifiers((prev) => ({ ...prev, [groupId]: list }));
    } catch {
      toast.error('Failed to load modifiers.');
    } finally {
      setLoadingModifiers((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Group handlers
  // -------------------------------------------------------------------------

  function handleCreateGroup() {
    setEditGroup(null);
    setGroupFormOpen(true);
  }

  function handleEditGroup(group: ModifierGroup) {
    setEditGroup(group);
    setGroupFormOpen(true);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch modifiers when expanding if not already loaded
        if (!groupModifiers[id]) {
          fetchGroupModifiers(id);
        }
      }
      return next;
    });
  }

  async function handleDeleteGroup() {
    if (!deleteGroupTarget) return;
    setDeletingGroup(true);
    try {
      await api.delete(`/modifier-groups/${deleteGroupTarget.id}`);
      toast.success(`"${deleteGroupTarget.name}" deleted.`);
      setDeleteGroupTarget(null);
      // Clean up cached modifiers
      setGroupModifiers((prev) => {
        const next = { ...prev };
        delete next[deleteGroupTarget.id];
        return next;
      });
      fetchGroups();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to delete modifier group.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setDeletingGroup(false);
    }
  }

  // -------------------------------------------------------------------------
  // Modifier handlers
  // -------------------------------------------------------------------------

  function handleCreateModifier(groupId: string) {
    setEditModifier(null);
    setModGroupId(groupId);
    setModFormOpen(true);
  }

  function handleEditModifier(mod: Modifier, groupId: string) {
    setEditModifier(mod);
    setModGroupId(groupId);
    setModFormOpen(true);
  }

  // Called after a modifier is created/edited — re-fetch that group's modifiers + groups list
  function handleModifierSaved() {
    if (modGroupId) {
      fetchGroupModifiers(modGroupId);
    }
    fetchGroups(); // refresh modifierCount
  }

  async function handleToggleDefault(mod: Modifier, groupId: string) {
    const newVal = !mod.isDefault;
    // Optimistic update
    setGroupModifiers((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).map((m) =>
        m.id === mod.id ? { ...m, isDefault: newVal } : m,
      ),
    }));
    try {
      await api.put(`/modifiers/${mod.id}`, { isDefault: newVal });
    } catch {
      // Revert
      setGroupModifiers((prev) => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).map((m) =>
          m.id === mod.id ? { ...m, isDefault: !newVal } : m,
        ),
      }));
      toast.error('Failed to update default status.');
    }
  }

  async function handleDeleteModifier() {
    if (!deleteModTarget) return;
    setDeletingMod(true);
    try {
      await api.delete(`/modifiers/${deleteModTarget.id}`);
      toast.success(`"${deleteModTarget.name}" removed.`);
      setDeleteModTarget(null);
      // Refresh that group's modifiers + group list
      if (deleteModGroupId) {
        fetchGroupModifiers(deleteModGroupId);
      }
      fetchGroups();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to delete modifier.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setDeletingMod(false);
    }
  }

  async function handleModifierDragEnd(groupId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const modifiers = groupModifiers[groupId];
    if (!modifiers) return;

    const oldIndex = modifiers.findIndex((m) => m.id === active.id);
    const newIndex = modifiers.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(modifiers, oldIndex, newIndex).map((m, i) => ({
      ...m,
      sortOrder: i + 1,
    }));

    // Optimistic update
    setGroupModifiers((prev) => ({ ...prev, [groupId]: reordered }));

    try {
      await api.patch(`/modifier-groups/${groupId}/modifiers/reorder`, {
        items: reordered.map((m) => ({ id: m.id, sortOrder: m.sortOrder })),
      });
    } catch {
      fetchGroupModifiers(groupId);
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
          <h1 className="text-3xl font-bold tracking-tight">Modifier Groups</h1>
          <p className="text-sm text-muted-foreground">
            Manage product options like sizes, milk choices, and extras.
          </p>
        </div>
        <Button onClick={handleCreateGroup}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Group
        </Button>
      </div>

      {/* Loading skeletons */}
      {loading &&
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />
        ))}

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-muted-foreground">
          <p className="text-sm">No modifier groups yet.</p>
          <p className="text-xs">
            Create groups like &quot;Milk Options&quot; or &quot;Size&quot; to add options to your
            products.
          </p>
          <Button size="sm" variant="outline" onClick={handleCreateGroup}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Group
          </Button>
        </div>
      )}

      {/* Group list */}
      {!loading &&
        groups.map((group) => {
          const isOpen = expanded.has(group.id);
          const modifiers = groupModifiers[group.id] ?? [];
          const isLoadingMods = loadingModifiers.has(group.id);
          const modCount = group.modifierCount ?? modifiers.length;

          return (
            <div key={group.id} className="rounded-lg border">
              {/* Group header */}
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50"
                onClick={() => toggleExpand(group.id)}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{group.name}</span>
                    {group.displayName && group.displayName !== group.name && (
                      <span className="text-xs text-muted-foreground truncate">
                        ({group.displayName})
                      </span>
                    )}
                  </div>
                </div>

                <Badge variant={group.selectionType === 'single' ? 'default' : 'secondary'}>
                  {selectionLabel(group)}
                </Badge>

                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {modCount} modifier{modCount !== 1 ? 's' : ''}
                </span>

                {typeof group.productCount === 'number' && (
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {group.productCount} product{group.productCount !== 1 ? 's' : ''}
                  </span>
                )}

                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditGroup(group)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Group
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteGroupTarget(group)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Expanded: modifier list */}
              {isOpen && (
                <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
                  {isLoadingMods && (
                    <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading modifiers...</span>
                    </div>
                  )}

                  {!isLoadingMods && modifiers.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No modifiers in this group yet.
                    </p>
                  )}

                  {!isLoadingMods && modifiers.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleModifierDragEnd(group.id, e)}
                    >
                      <SortableContext
                        items={modifiers.map((m) => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {modifiers.map((mod) => (
                          <SortableModifierRow
                            key={mod.id}
                            modifier={mod}
                            onEdit={() => handleEditModifier(mod, group.id)}
                            onDelete={() => {
                              setDeleteModTarget(mod);
                              setDeleteModGroupId(group.id);
                            }}
                            onToggleDefault={() => handleToggleDefault(mod, group.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => handleCreateModifier(group.id)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Modifier
                  </Button>
                </div>
              )}
            </div>
          );
        })}

      {/* Group form */}
      <ModifierGroupForm
        open={groupFormOpen}
        onOpenChange={setGroupFormOpen}
        group={editGroup}
        onSaved={fetchGroups}
      />

      {/* Modifier form */}
      <ModifierForm
        open={modFormOpen}
        onOpenChange={setModFormOpen}
        modifier={editModifier}
        groupId={modGroupId}
        onSaved={handleModifierSaved}
      />

      {/* Delete group confirmation */}
      <Dialog
        open={!!deleteGroupTarget}
        onOpenChange={(open) => !open && setDeleteGroupTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete modifier group</DialogTitle>
            <DialogDescription>
              {deleteGroupTarget && (deleteGroupTarget.productCount ?? 0) > 0 ? (
                <>
                  <strong className="text-destructive">Warning:</strong> &quot;
                  {deleteGroupTarget.name}&quot; is linked to {deleteGroupTarget.productCount}{' '}
                  product
                  {deleteGroupTarget.productCount === 1 ? '' : 's'}. Deleting it will remove these
                  options from those products.
                </>
              ) : (
                <>
                  Are you sure you want to delete &quot;{deleteGroupTarget?.name}&quot; and all its
                  modifiers? This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteGroupTarget(null)}
              disabled={deletingGroup}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteGroup} disabled={deletingGroup}>
              {deletingGroup ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete modifier confirmation */}
      <Dialog open={!!deleteModTarget} onOpenChange={(open) => !open && setDeleteModTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove modifier</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;{deleteModTarget?.name}&quot;? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModTarget(null)}
              disabled={deletingMod}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteModifier} disabled={deletingMod}>
              {deletingMod ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
